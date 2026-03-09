import { WebClient } from '@slack/web-api'
import { prisma } from './db'

// Get Slack WebClient with bot token from settings
async function getSlackClient(): Promise<WebClient> {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })

  if (!settings?.slackBotToken) {
    throw new Error('Slack bot token not configured. Please add it in Settings.')
  }

  return new WebClient(settings.slackBotToken)
}

// List all channels where the bot is a member (fast - uses users.conversations)
export async function listChannels() {
  const client = await getSlackClient()

  // Use users.conversations which only returns channels the bot is a member of
  // This is much faster than listing all channels and filtering
  const result = await client.users.conversations({
    types: 'public_channel,private_channel',
    exclude_archived: true,
    limit: 200,
  })

  return (result.channels || []).map((ch) => ({
    id: ch.id || '',
    name: ch.name || '',
    topic: ch.topic?.value || '',
    memberCount: (ch as any).num_members || 0,
  }))
}

// Get channel history (messages)
export async function getChannelHistory(channelId: string, limit = 100) {
  const client = await getSlackClient()

  const result = await client.conversations.history({
    channel: channelId,
    limit,
  })

  // Get user info for messages
  const userIds = new Set<string>()
  result.messages?.forEach((msg) => {
    if (msg.user) userIds.add(msg.user)
  })

  // Fetch user names
  const userMap: Record<string, string> = {}
  for (const userId of Array.from(userIds)) {
    try {
      const userInfo = await client.users.info({ user: userId })
      userMap[userId] = userInfo.user?.real_name || userInfo.user?.name || userId
    } catch {
      userMap[userId] = userId
    }
  }

  return (result.messages || [])
    .filter((msg) => msg.type === 'message' && !msg.subtype) // Filter out system messages
    .map((msg) => ({
      ts: msg.ts || '',
      userId: msg.user || '',
      userName: msg.user ? userMap[msg.user] : '',
      text: msg.text || '',
      threadTs: msg.thread_ts || null,
    }))
}

// Sync a brand's Slack channel messages to the database
export async function syncBrandSlackChannel(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
  })

  if (!brand || !brand.slackChannelId) {
    throw new Error('Brand not found or no Slack channel connected')
  }

  try {
    // Fetch channel messages
    const messages = await getChannelHistory(brand.slackChannelId, 200)

    // Upsert messages (don't delete - we want to accumulate history)
    for (const msg of messages) {
      await prisma.slackMessage.upsert({
        where: {
          brandId_messageTs: {
            brandId,
            messageTs: msg.ts,
          },
        },
        update: {
          content: msg.text,
          userName: msg.userName,
        },
        create: {
          brandId,
          messageTs: msg.ts,
          channelId: brand.slackChannelId,
          userId: msg.userId,
          userName: msg.userName,
          content: msg.text,
          threadTs: msg.threadTs,
        },
      })
    }

    return { success: true, messageCount: messages.length }
  } catch (error) {
    console.error('Failed to sync Slack channel:', error)
    throw error
  }
}

// Get all indexed messages for a brand
export async function getBrandSlackContext(brandId: string) {
  const messages = await prisma.slackMessage.findMany({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
    take: 50, // Last 50 messages for context
  })

  return messages.map((m) => ({
    user: m.userName || 'Unknown',
    text: m.content,
    timestamp: m.createdAt,
  }))
}
