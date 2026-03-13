import { NextRequest, NextResponse } from 'next/server'
import { WebClient } from '@slack/web-api'
import { waitUntil } from '@vercel/functions'
import { prisma } from '@/lib/db'
import { runSlackAgent } from '@/lib/slack-bot-agent'

// Force dynamic - API routes should never be prerendered
export const dynamic = 'force-dynamic'

/**
 * Formats confidence score with emoji indicator for Slack messages
 * @param confidence - Score from 0-100
 * @returns Formatted string with emoji and percentage
 */
function formatConfidence(confidence: number): string {
  let emoji = '🔴'  // Red for low confidence
  let label = 'Low confidence'

  if (confidence >= 80) {
    emoji = '🟢'  // Green for high confidence
    label = 'High confidence'
  } else if (confidence >= 60) {
    emoji = '🟡'  // Yellow for medium confidence
    label = 'Medium confidence'
  }

  return `\n\n_${emoji} ${label}: ${confidence}%_`
}

// GET handler - for browser/health check access
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Bloom Slack Events Webhook',
    info: 'This endpoint receives POST requests from Slack. Visit /api/slack/health for connection status.',
    timestamp: new Date().toISOString(),
  })
}

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

// Smart brand resolution with fallback logic
// Priority: 1) Channel-specific mapping, 2) Default brand, 3) Only brand in system
async function getBrandForChannel(channelId: string) {
  // Priority 1: Check for channel-specific brand mapping (existing behavior)
  const channelBrand = await prisma.brand.findFirst({
    where: { slackChannelId: channelId },
  })

  if (channelBrand) {
    console.log('[Slack Bot] Found channel-mapped brand:', channelBrand.name)
    return channelBrand
  }

  // Priority 2: Check for default brand
  const defaultBrand = await prisma.brand.findFirst({
    where: { isDefault: true },
  })

  if (defaultBrand) {
    console.log('[Slack Bot] Using default brand:', defaultBrand.name)
    return defaultBrand
  }

  // Priority 3: If only one brand exists, use it automatically
  const allBrands = await prisma.brand.findMany({
    take: 2, // Only need to know if 0, 1, or 2+ brands
  })

  if (allBrands.length === 1) {
    console.log('[Slack Bot] Auto-selecting only brand:', allBrands[0].name)
    return allBrands[0]
  }

  // No brand could be determined
  console.log('[Slack Bot] No brand found. Total brands:', allBrands.length)
  return null
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
        // Use waitUntil so Vercel keeps the function alive until processing completes
        waitUntil(
          handleMention(event).catch((err) =>
            console.error('[Slack Events] Error handling mention:', err)
          )
        )
        return NextResponse.json({ ok: true })
      }

      // Handle direct messages
      if (event.type === 'message' && event.channel_type === 'im') {
        // Ignore bot messages to prevent loops
        if (event.bot_id) {
          return NextResponse.json({ ok: true })
        }

        // Use waitUntil so Vercel keeps the function alive until processing completes
        waitUntil(
          handleDirectMessage(event).catch((err) =>
            console.error('Error handling DM:', err)
          )
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
  const startTime = Date.now()
  console.log('[Slack Bot] ===== MENTION START =====')
  console.log('[Slack Bot] Channel:', event.channel)
  console.log('[Slack Bot] User:', event.user)
  console.log('[Slack Bot] Text:', event.text?.slice(0, 100))
  console.log('[Slack Bot] Thread:', event.thread_ts)

  const client = await getSlackClient()
  console.log(`[Slack Bot] Got Slack client (${Date.now() - startTime}ms)`)
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim() // Remove @mentions
  const channelId = event.channel
  const threadTs = event.thread_ts || event.ts

  console.log('[Slack Bot] Looking for brand with channelId:', channelId)

  // Smart brand resolution with fallback
  const brand = await getBrandForChannel(channelId)

  if (!brand) {
    // No brand could be determined
    const brandCount = await prisma.brand.count()

    const message = brandCount === 0
      ? "Hey! I don't have any brands set up yet. Add a brand in the Bloom dashboard first, and I'll be ready to help!"
      : "Hey! I found multiple brands but none is set as default. Either:\n- Set a default brand in the Bloom dashboard\n- Or connect this channel to a specific brand"

    await client.chat.postMessage({
      channel: channelId,
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message,
          },
        },
      ],
      thread_ts: threadTs,
    })
    return
  }

  console.log('[Slack Bot] Using brand:', brand.name)

  // Get thread context if this is a thread reply
  // conversations.replies returns oldest-first (correct order)
  const threadContext: string[] = []
  if (event.thread_ts) {
    try {
      const threadResult = await client.conversations.replies({
        channel: channelId,
        ts: event.thread_ts,
        limit: 20,  // grab more thread history for better context
      })

      if (threadResult.messages) {
        for (const msg of threadResult.messages) {
          // Skip the current message itself
          if (msg.ts === event.ts) continue
          // Truncate individual messages to avoid token bloat
          const text = (msg.text || '').slice(0, 1000)
          if (!text) continue

          // Bot messages have bot_id instead of user — attribute to "Bloom"
          if (msg.bot_id) {
            threadContext.push(`Bloom: ${text}`)
          } else if (msg.user) {
            const userName = await getUserName(client, msg.user)
            threadContext.push(`${userName}: ${text}`)
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch thread context:', err)
    }
  }

  // Get recent channel history for additional context
  // conversations.history returns newest-first — reverse to chronological order
  const channelHistory: string[] = []
  try {
    const historyResult = await client.conversations.history({
      channel: channelId,
      limit: 15,
    })

    if (historyResult.messages) {
      // Reverse so oldest messages come first (chronological context)
      const msgs = [...historyResult.messages].reverse()
      for (const msg of msgs) {
        if (!msg.text || msg.ts === event.ts) continue
        if (msg.subtype) continue  // skip joins, leaves, etc.
        // Truncate individual messages
        const text = msg.text.slice(0, 500)
        if (msg.bot_id) {
          channelHistory.push(`Bloom: ${text}`)
        } else if (msg.user) {
          const userName = await getUserName(client, msg.user)
          channelHistory.push(`${userName}: ${text}`)
        }
      }
    }
  } catch (err) {
    console.error('Failed to fetch channel history:', err)
  }

  try {
    console.log('[Slack Bot] Running agent for brand:', brand.name)
    console.log('[Slack Bot] Question:', text.slice(0, 100))
    const agentStartTime = Date.now()

    // Run the agent
    const result = await runSlackAgent({
      brandId: brand.id,
      question: text,
      threadContext,
      channelHistory,
    })

    console.log(`[Slack Bot] Agent complete (${Date.now() - agentStartTime}ms)`)

    // Post response in thread with mrkdwn formatting and confidence indicator
    const answerWithConfidence = result.answer + formatConfidence(result.confidence)

    await client.chat.postMessage({
      channel: channelId,
      text: answerWithConfidence, // Fallback for notifications
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: answerWithConfidence,
          },
        },
      ],
      thread_ts: threadTs,
    })

    console.log(`[Slack Bot] ===== COMPLETE: ${Date.now() - startTime}ms =====`)
  } catch (error) {
    console.error(`[Slack Bot] ===== ERROR after ${Date.now() - startTime}ms =====`)
    console.error('[Slack Bot] Error:', error)

    const errorMessage = "Sorry, I ran into an issue with that question. Try asking again, or check if your campaign trackers are synced."
    const errorWithConfidence = errorMessage + formatConfidence(0)

    await client.chat.postMessage({
      channel: channelId,
      text: errorWithConfidence,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: errorWithConfidence,
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

  // Try to find a usable brand for DMs using smart resolution
  const brand = await getBrandForChannel(channelId)

  if (brand) {
    // We have a brand context, process the DM like a mention
    console.log('[Slack Bot] Processing DM with brand:', brand.name)

    // Fetch recent DM history so the bot has conversation memory
    const dmHistory: string[] = []
    try {
      const dmHistoryResult = await client.conversations.history({
        channel: channelId,
        limit: 15,
      })
      if (dmHistoryResult.messages) {
        const msgs = [...(dmHistoryResult.messages || [])].reverse()
        for (const msg of msgs) {
          if (!msg.text || msg.ts === event.ts) continue
          const text = msg.text.slice(0, 500)
          if (msg.bot_id) {
            dmHistory.push(`Bloom: ${text}`)
          } else if (msg.user) {
            const userName = await getUserName(client, msg.user)
            dmHistory.push(`${userName}: ${text}`)
          }
        }
      }
    } catch (err) {
      console.error('[Slack Bot] Failed to fetch DM history:', err)
    }

    try {
      const result = await runSlackAgent({
        brandId: brand.id,
        question: text,
        threadContext: [],
        channelHistory: dmHistory,
      })

      const answerWithConfidence = result.answer + formatConfidence(result.confidence)

      await client.chat.postMessage({
        channel: channelId,
        text: answerWithConfidence,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: answerWithConfidence },
          },
        ],
      })
    } catch (error) {
      console.error('[Slack Bot] DM processing error:', error)
      const dmErrorMessage = "Sorry, I ran into an issue. Try again or @mention me in a channel."
      const dmErrorWithConfidence = dmErrorMessage + formatConfidence(0)
      await client.chat.postMessage({
        channel: channelId,
        text: dmErrorWithConfidence,
      })
    }
    return
  }

  // No brand context available - give guidance
  await client.chat.postMessage({
    channel: channelId,
    text: "Hey! I need a brand context to help you. Set up a brand in the Bloom dashboard, and I'll be ready to answer your questions!",
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Hey! I need a brand context to help you.\n\n*Quick setup:*\n1. Go to the Bloom dashboard\n2. Create a brand (it will be set as default automatically)\n3. Then message me here or @mention me in any channel!",
        },
      },
    ],
  })
}
