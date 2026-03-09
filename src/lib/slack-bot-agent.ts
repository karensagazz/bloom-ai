import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Bot personality and system prompt
const BOT_SYSTEM_PROMPT = `You are Bloom, a helpful AI assistant for the Superbloom team (an influencer marketing agency).

TONE & PERSONALITY:
- 🤝 Relationship-first - Warm, supportive, collaborative
- 📚 Context-giving - Explain the "why" behind answers
- 💡 Expert but kind - Knowledgeable without being condescending
- 🎯 Concise with depth - Brief answers with offers for more detail

YOUR AUDIENCE: The Superbloom team (influencer marketing professionals)

RESPONSE FORMAT:
1. Answer the question directly and concisely
2. Give context for your answer (where data came from, what it means)
3. Use friendly language with occasional emojis (🙌, 📊, 🎯)
4. Always cite your data source and when it was last synced
5. ALWAYS end with a confidence percentage based on:
   - Data freshness (when was tracker last synced?)
   - Data completeness (missing fields?)
   - Query specificity (exact match vs inference?)
   - Context availability (thread + channel history)

SLACK FORMATTING RULES:
- Use *bold* for creator names, metrics, and key data points (e.g., *Sarah Styles*, *$5,000*, *8 campaigns*)
- Use _italic_ for emphasis or secondary context (e.g., _synced 2 hours ago_, _from Q1 2024 Tracker_)
- Use bullet lists with dash and space (- item) for listing multiple items
- Use numbered lists (1. item) for ranked results or step-by-step guidance
- Use > blockquote for quoting specific tracker notes or insights
- NEVER use markdown double-asterisks (**) or double-underscores (__) - Slack uses single characters only
- Keep structure readable: leave blank lines between sections for better visual separation

LOW CONFIDENCE GUIDANCE (< 60%):
When confidence is below 60%, always:
1. Clearly state what data IS available vs what's missing
2. Explain WHY you're uncertain (stale data, no matching records, incomplete tracker data, etc.)
3. Suggest a concrete next step (e.g., "Sync the 2024 tracker" or "Check the SOW Review tab for this creator")
4. Frame partial answers as estimates: "Based on what I have, approximately..."
5. Be helpful even with limited data - provide what you can while being transparent about gaps

CONFIDENCE SCORING GUIDE:
- 90-100%: Direct match from recently synced tracker (< 24 hours)
- 75-89%: Good data but slightly stale (1-7 days) or partial match
- 60-74%: Based on partial data or older sync (> 7 days)
- 40-59%: Inferred from limited data or conversations
- < 40%: Very limited data, recommend syncing trackers

EXAMPLE RESPONSE:
"Hey! Based on your 2024 Campaign Tracker, @sarah_styles is crushing it 🙌

She's completed 8 campaigns this quarter with an avg engagement of 5.2% — that's 40% above your typical creator performance.

📊 Confidence: 92% (synced 2 hours ago from "Q1 2024 Tracker")

Want me to dig into her content breakdown or compare with other top performers?"

IMPORTANT:
- Only respond when explicitly asked a question
- Read full thread context for follow-ups
- Be helpful and encouraging
- Cite specific tracker names and sync times
- Offer to provide more detail if they want to dig deeper`

// Tool definitions for the agent
const tools: Anthropic.Tool[] = [
  {
    name: 'search_influencers',
    description: 'Search for influencers/creators by name, handle, or platform for a specific brand. Returns influencer details including campaign count, platform, estimated rate.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to search within',
        },
        query: {
          type: 'string',
          description: 'Search query - can be influencer name, handle, or platform',
        },
        platform: {
          type: 'string',
          enum: ['instagram', 'tiktok', 'youtube', 'all'],
          description: 'Filter by platform (optional)',
        },
      },
      required: ['brandId'],
    },
  },
  {
    name: 'get_campaigns',
    description: 'Get campaign records with optional filters. Returns campaign details including influencer, deal value, platform, status.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to query',
        },
        year: {
          type: 'number',
          description: 'Filter by year (optional)',
        },
        status: {
          type: 'string',
          description: 'Filter by status like "completed", "in progress", etc. (optional)',
        },
        influencerName: {
          type: 'string',
          description: 'Filter by influencer name (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50)',
        },
      },
      required: ['brandId'],
    },
  },
  {
    name: 'get_contracts',
    description: 'Get SOW/contract records. Returns contract details including deliverables, exclusivity, usage rights, contract dates.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to query',
        },
        status: {
          type: 'string',
          enum: ['active', 'completed', 'pending', 'all'],
          description: 'Filter by contract status (optional)',
        },
      },
      required: ['brandId'],
    },
  },
  {
    name: 'calculate_metrics',
    description: 'Calculate aggregated metrics like total spend, average deal value, completion rate, repeat creator rate.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to calculate metrics for',
        },
        metric: {
          type: 'string',
          enum: ['spend', 'completion_rate', 'repeat_rate', 'top_creators', 'platform_breakdown'],
          description: 'The metric to calculate',
        },
      },
      required: ['brandId', 'metric'],
    },
  },
  {
    name: 'get_tracker_info',
    description: 'Get information about campaign trackers including last sync time, record count, and data freshness.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to query',
        },
      },
      required: ['brandId'],
    },
  },
]

// Execute tool calls
async function executeToolCall(toolName: string, toolInput: any): Promise<any> {
  const { brandId } = toolInput

  switch (toolName) {
    case 'search_influencers': {
      const { query, platform } = toolInput

      const where: any = { brandId }

      if (platform && platform !== 'all') {
        where.platform = platform
      }

      if (query) {
        where.OR = [
          { name: { contains: query } },
          { email: { contains: query } },
        ]
      }

      const influencers = await prisma.brandInfluencer.findMany({
        where,
        orderBy: { totalCampaigns: 'desc' },
        take: 10,
      })

      return {
        count: influencers.length,
        influencers: influencers.map(i => ({
          name: i.name,
          email: i.email,
          platform: i.platform,
          totalCampaigns: i.totalCampaigns,
          estimatedRate: i.estimatedRate,
        })),
      }
    }

    case 'get_campaigns': {
      const { year, status, influencerName, limit = 50 } = toolInput

      const where: any = { brandId }

      if (year) where.year = year
      if (status) where.status = { contains: status }
      if (influencerName) where.influencerName = { contains: influencerName }

      const campaigns = await prisma.campaignRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      return {
        count: campaigns.length,
        campaigns: campaigns.map(c => ({
          influencerName: c.influencerName,
          campaignName: c.campaignName,
          platform: c.platform,
          contentType: c.contentType,
          dealValue: c.dealValue,
          status: c.status,
          year: c.year,
          quarter: c.quarter,
        })),
      }
    }

    case 'get_contracts': {
      const { status = 'all' } = toolInput

      const where: any = { brandId, recordType: 'sow' }

      if (status !== 'all') {
        where.status = { contains: status }
      }

      const contracts = await prisma.campaignRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      })

      return {
        count: contracts.length,
        contracts: contracts.map(c => ({
          influencerName: c.influencerName,
          campaignName: c.campaignName,
          platform: c.platform,
          contractType: c.contractType,
          contractStart: c.contractStart,
          contractEnd: c.contractEnd,
          totalValue: c.totalValue,
          status: c.status,
          deliverables: c.deliverables,
        })),
      }
    }

    case 'calculate_metrics': {
      const { metric } = toolInput

      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        include: {
          campaignRecords: true,
          brandInfluencers: true,
        },
      })

      if (!brand) {
        return { error: 'Brand not found' }
      }

      // Helper to parse deal values
      const parseDealValue = (value: string | null): number => {
        if (!value) return 0
        const cleaned = value.replace(/[$,]/g, '').toLowerCase().trim()
        const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/)
        if (kMatch) return parseFloat(kMatch[1]) * 1000
        const numMatch = cleaned.match(/\d+(?:\.\d+)?/)
        return numMatch ? parseFloat(numMatch[0]) : 0
      }

      switch (metric) {
        case 'spend': {
          const campaigns = brand.campaignRecords.filter(
            c => c.status?.toUpperCase() !== 'SOW WIP'
          )
          const dealValues = campaigns.map(c => parseDealValue(c.dealValue)).filter(v => v > 0)
          const totalSpend = dealValues.reduce((sum, v) => sum + v, 0)
          const avgDealValue = dealValues.length > 0 ? totalSpend / dealValues.length : 0

          return {
            totalSpend,
            avgDealValue,
            campaignCount: dealValues.length,
            minDeal: dealValues.length > 0 ? Math.min(...dealValues) : 0,
            maxDeal: dealValues.length > 0 ? Math.max(...dealValues) : 0,
          }
        }

        case 'completion_rate': {
          const total = brand.campaignRecords.length
          const completed = brand.campaignRecords.filter(
            c => c.status?.toLowerCase().includes('complete')
          ).length

          return {
            total,
            completed,
            rate: total > 0 ? (completed / total) * 100 : 0,
          }
        }

        case 'repeat_rate': {
          const total = brand.brandInfluencers.length
          const repeat = brand.brandInfluencers.filter(i => i.totalCampaigns > 1).length

          return {
            totalCreators: total,
            repeatCreators: repeat,
            rate: total > 0 ? (repeat / total) * 100 : 0,
          }
        }

        case 'top_creators': {
          const top = brand.brandInfluencers
            .sort((a, b) => b.totalCampaigns - a.totalCampaigns)
            .slice(0, 5)
            .map(i => ({
              name: i.name,
              platform: i.platform,
              totalCampaigns: i.totalCampaigns,
              estimatedRate: i.estimatedRate,
            }))

          return { topCreators: top }
        }

        case 'platform_breakdown': {
          const platformCounts: Record<string, number> = {}
          brand.campaignRecords.forEach(c => {
            const platform = c.platform || 'Unknown'
            platformCounts[platform] = (platformCounts[platform] || 0) + 1
          })

          return { platforms: platformCounts }
        }

        default:
          return { error: 'Unknown metric' }
      }
    }

    case 'get_tracker_info': {
      const brand = await prisma.brand.findUnique({
        where: { id: brandId },
        include: {
          campaignTrackers: {
            include: {
              _count: {
                select: { campaignRecords: true },
              },
            },
          },
        },
      })

      if (!brand) {
        return { error: 'Brand not found' }
      }

      return {
        trackers: brand.campaignTrackers.map(t => ({
          label: t.label,
          year: t.year,
          lastSyncedAt: t.lastSyncedAt,
          syncStatus: t.syncStatus,
          recordCount: t._count.campaignRecords,
        })),
        lastSyncedAt: brand.lastSyncedAt,
      }
    }

    default:
      return { error: 'Unknown tool' }
  }
}

// Calculate confidence score
function calculateConfidence(
  trackerInfo: any,
  dataCompleteness: number,
  querySpecificity: 'exact' | 'partial' | 'inferred'
): number {
  let confidence = 100

  // Factor 1: Data freshness (0-40 points deduction)
  if (trackerInfo?.lastSyncedAt) {
    const hoursSinceSync = (Date.now() - new Date(trackerInfo.lastSyncedAt).getTime()) / (1000 * 60 * 60)

    if (hoursSinceSync < 24) {
      confidence -= 0 // Very fresh
    } else if (hoursSinceSync < 24 * 7) {
      confidence -= 10 // Within a week
    } else if (hoursSinceSync < 24 * 30) {
      confidence -= 25 // Within a month
    } else {
      confidence -= 40 // Stale data
    }
  } else {
    confidence -= 40 // No sync info
  }

  // Factor 2: Data completeness (0-30 points deduction)
  confidence -= (1 - dataCompleteness) * 30

  // Factor 3: Query specificity (0-20 points deduction)
  if (querySpecificity === 'partial') {
    confidence -= 10
  } else if (querySpecificity === 'inferred') {
    confidence -= 20
  }

  return Math.max(10, Math.min(100, Math.round(confidence)))
}

// Main agent function
export async function runSlackAgent(options: {
  brandId: string
  question: string
  threadContext?: string[]
  channelHistory?: string[]
}): Promise<{
  answer: string
  confidence: number
  source: string
}> {
  const { brandId, question, threadContext = [], channelHistory = [] } = options

  // Build context from thread and channel
  const contextMessages: string[] = []

  if (channelHistory.length > 0) {
    contextMessages.push('=== Recent Channel History ===')
    contextMessages.push(...channelHistory.slice(-10))
  }

  if (threadContext.length > 0) {
    contextMessages.push('=== Thread Context ===')
    contextMessages.push(...threadContext)
  }

  const contextStr = contextMessages.length > 0
    ? `\n\n${contextMessages.join('\n')}\n\n`
    : ''

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `${contextStr}Question: ${question}`,
    },
  ]

  // Get brand info for context
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { name: true },
  })

  const systemPrompt = `${BOT_SYSTEM_PROMPT}\n\nYou are currently helping with questions about the brand: ${brand?.name || 'Unknown Brand'}\nBrand ID: ${brandId}`

  let response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    tools,
    messages,
  })

  // Agent loop - process tool calls until we get a final response
  let iterationCount = 0
  const maxIterations = 10
  let lastTrackerInfo: any = null

  while (response.stop_reason === 'tool_use' && iterationCount < maxIterations) {
    iterationCount++

    // Get ALL tool_use blocks from the response (Claude may return multiple)
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (toolUseBlocks.length === 0) break

    // Execute ALL tools and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUseBlock of toolUseBlocks) {
      const toolResult = await executeToolCall(toolUseBlock.name, toolUseBlock.input)

      // Store tracker info for confidence calculation
      if (toolUseBlock.name === 'get_tracker_info') {
        lastTrackerInfo = toolResult
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUseBlock.id,
        content: JSON.stringify(toolResult),
      })
    }

    // Add assistant's tool use to messages
    messages.push({
      role: 'assistant',
      content: response.content,
    })

    // Add ALL tool results in a single user message
    messages.push({
      role: 'user',
      content: toolResults,
    })

    // Get next response
    response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    })
  }

  // Extract final text response
  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )

  const answer = textBlock?.text || "I couldn't process that request."

  // Calculate confidence score
  // Extract confidence from answer if present, otherwise calculate
  const confidenceMatch = answer.match(/Confidence:\s*(\d+)%/)
  let confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 75

  // If no explicit confidence in answer, calculate it
  if (!confidenceMatch && lastTrackerInfo) {
    confidence = calculateConfidence(lastTrackerInfo, 0.8, 'exact')
  }

  // Determine source
  let source = 'Campaign Trackers'
  if (lastTrackerInfo?.trackers) {
    const trackerLabels = lastTrackerInfo.trackers
      .map((t: any) => t.label || 'Campaign Tracker')
      .join(', ')
    source = trackerLabels
  }

  // Append actionable guidance for low-confidence responses
  let finalAnswer = answer
  if (confidence < 60) {
    const guidanceLines = [
      '',
      '---',
      '_💡 To improve confidence on this question:_',
      '- Sync your campaign tracker (Bloom dashboard → brand → Sync)',
      '- Add more data to the relevant tab in your spreadsheet',
      '- Check if the tracker covers the time period you\'re asking about',
      '- Verify that column headers match expected patterns (e.g., "Influencer Name", "Engagement Rate")',
    ]
    finalAnswer = answer + '\n' + guidanceLines.join('\n')
  }

  return {
    answer: finalAnswer,
    confidence,
    source,
  }
}
