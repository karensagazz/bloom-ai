import { NextRequest, NextResponse } from 'next/server'
import { WebClient } from '@slack/web-api'
import { prisma } from '@/lib/db'
import { runSlackAgent } from '@/lib/slack-bot-agent'

// Get Slack client
async function getSlackClient(): Promise<WebClient> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })

  if (!settings?.slackBotToken) {
    throw new Error('Slack bot token not configured')
  }

  return new WebClient(settings.slackBotToken)
}

// Handle Slack events
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Log all incoming events for debugging
    console.log('[Slack Events] Received:', JSON.stringify({
      type: body.type,
      event_type: body.event?.type,
      channel: body.event?.channel,
      user: body.event?.user,
      text: body.event?.text?.slice(0, 100),
    }))

    // Handle Slack URL verification challenge
    if (body.type === 'url_verification') {
      console.log('[Slack Events] URL verification challenge received')
      return NextResponse.json({ challenge: body.challenge })
    }

    // Handle event callbacks
    if (body.type === 'event_callback') {
      const event = body.event

      // Handle app mentions (@Bloom)
      if (event.type === 'app_mention') {
        console.log('[Slack Events] App mention received from', event.user, 'in channel', event.channel)
        // Process in background to avoid Slack timeout
        handleMention(event).catch((err) =>
          console.error('[Slack Events] Error handling mention:', err)
        )
        return NextResponse.json({ ok: true })
      }

      // Handle direct messages
      if (event.type === 'message' && event.channel_type === 'im') {
        // Ignore bot messages to prevent loops
        if (event.bot_id) {
          return NextResponse.json({ ok: true })
        }

        handleDirectMessage(event).catch((err) =>
          console.error('Error handling DM:', err)
        )
        return NextResponse.json({ ok: true })
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Slack events error:', error)
    return NextResponse.json({ error: 'Failed to process event' }, { status: 500 })
  }
}

// Handle @mention in a channel
async function handleMention(event: any) {
  console.log('[Slack Bot] Processing mention:', {
    channel: event.channel,
    user: event.user,
    text: event.text?.slice(0, 100),
    thread_ts: event.thread_ts,
  })

  const client = await getSlackClient()
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim() // Remove @mentions
  const channelId = event.channel
  const threadTs = event.thread_ts || event.ts

  console.log('[Slack Bot] Looking for brand with channelId:', channelId)

  // Find brand associated with this channel
  const brand = await prisma.brand.findFirst({
    where: { slackChannelId: channelId },
  })

  console.log('[Slack Bot] Found brand:', brand?.name || 'none')

  if (!brand) {
    // No brand connected to this channel
    await client.chat.postMessage({
      channel: channelId,
      text: "👋 Hey! I don't see this channel connected to a brand yet. You can connect it in the Bloom dashboard under the brand's Slack tab.",
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "👋 Hey! I don't see this channel connected to a brand yet. You can connect it in the Bloom dashboard under the brand's Slack tab.",
          },
        },
      ],
      thread_ts: threadTs,
    })
    return
  }

  // Get thread context if this is a thread reply
  const threadContext: string[] = []
  if (event.thread_ts) {
    try {
      const threadResult = await client.conversations.replies({
        channel: channelId,
        ts: event.thread_ts,
        limit: 10,
      })

      if (threadResult.messages) {
        for (const msg of threadResult.messages) {
          if (msg.text && msg.ts !== event.ts) {
            const userName = msg.user ? await getUserName(client, msg.user) : 'Unknown'
            threadContext.push(`${userName}: ${msg.text}`)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch thread context:', err)
    }
  }

  // Get recent channel history for additional context
  const channelHistory: string[] = []
  try {
    const historyResult = await client.conversations.history({
      channel: channelId,
      limit: 20,
    })

    if (historyResult.messages) {
      for (const msg of historyResult.messages) {
        if (msg.text && msg.type === 'message' && !msg.subtype && msg.ts !== event.ts) {
          const userName = msg.user ? await getUserName(client, msg.user) : 'Unknown'
          channelHistory.push(`${userName}: ${msg.text}`)
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch channel history:', err)
  }

  try {
    console.log('[Slack Bot] Running agent for brand:', brand.name, 'question:', text.slice(0, 50))

    // Run the agent
    const result = await runSlackAgent({
      brandId: brand.id,
      question: text,
      threadContext,
      channelHistory,
    })

    console.log('[Slack Bot] Agent response received, posting to Slack...')

    // Post response in thread with mrkdwn formatting
    await client.chat.postMessage({
      channel: channelId,
      text: result.answer, // Fallback for notifications
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: result.answer,
          },
        },
      ],
      thread_ts: threadTs,
    })

    console.log('[Slack Bot] Response posted successfully')
  } catch (error) {
    console.error('[Slack Bot] Agent error:', error)

    await client.chat.postMessage({
      channel: channelId,
      text: "Sorry, I ran into an issue processing that question. 😅 Try asking again or check if your campaign trackers are synced.",
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "Sorry, I ran into an issue processing that question. 😅 Try asking again or check if your campaign trackers are synced.",
          },
        },
      ],
      thread_ts: threadTs,
    })
  }
}

// Helper to get user name
async function getUserName(client: WebClient, userId: string): Promise<string> {
  try {
    const userInfo = await client.users.info({ user: userId })
    return userInfo.user?.real_name || userInfo.user?.name || userId
  } catch {
    return userId
  }
}

// Handle direct message to the bot
async function handleDirectMessage(event: any) {
  const client = await getSlackClient()
  const text = event.text
  const channelId = event.channel

  // For DMs, provide a helpful message about using the bot in brand channels
  await client.chat.postMessage({
    channel: channelId,
    text: "👋 Hey! I work best when you @mention me in a brand's Slack channel. That way, I have context about which brand you're asking about.\n\nTo use me:\n1. Go to the Bloom dashboard\n2. Connect a brand to a Slack channel\n3. @mention me in that channel with your question\n\nExample: `@Bloom who are our top performing creators this quarter?`",
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "👋 Hey! I work best when you @mention me in a brand's Slack channel. That way, I have context about which brand you're asking about.\n\n*To use me:*\n1. Go to the Bloom dashboard\n2. Connect a brand to a Slack channel\n3. @mention me in that channel with your question\n\n_Example:_ `@Bloom who are our top performing creators this quarter?`",
        },
      },
    ],
  })
}
