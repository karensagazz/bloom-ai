import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'
import * as fs from 'fs'
import * as path from 'path'

// Load tracker reading skill card from filesystem at startup
// This is injected into every prompt so the bot always follows it
function loadTrackerSkillCard(): string {
  try {
    const skillPath = path.join(process.cwd(), 'src', 'lib', 'skills', 'skill_tracker_reading.md')
    return fs.readFileSync(skillPath, 'utf-8')
  } catch {
    console.warn('[Slack Agent] Could not load tracker skill card from filesystem')
    return ''
  }
}

const TRACKER_SKILL_CARD = loadTrackerSkillCard()

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Timeout for AI API calls (prevents indefinite hangs in Slack bot)
const SLACK_AI_TIMEOUT_MS = 45000  // 45 seconds max per AI call

async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

// Bot personality and system prompt
const BOT_SYSTEM_PROMPT = `You are Bloom, a knowledgeable assistant for the Superbloom team (an influencer marketing agency).

TONE & PERSONALITY:
- Conversational and warm, like a helpful colleague
- Direct but friendly - get to the point without being cold
- Explain context naturally, not robotically
- Skip corporate speak - just talk like a person
- No emojis in responses

YOUR AUDIENCE: The Superbloom team (influencer marketing professionals who know their stuff)

RESPONSE FORMAT:
1. Answer the question directly and concisely
2. Give context naturally (where data came from, what it means)
3. Cite your data source and when it was last synced
4. End with a confidence note based on data quality

CRITICAL WORKFLOW RULES:
- ALWAYS call at least one data tool (get_campaigns, search_influencers, etc.) before answering any question about creators, campaigns, deals, or brand data. Never answer from memory alone.
- ALWAYS call submit_final_answer as your LAST action to submit your response. Never end with a plain text message — submit_final_answer IS your response.
- When you call submit_final_answer, be honest in the confidence field: base it on how many fields were actually populated (not blank) in the tool results you received.

SLACK FORMATTING:
- Use *bold* for creator names, metrics, and key data points
- Use _italic_ for secondary context like sync times
- Use bullet lists with dash (- item) for multiple items
- Use > blockquote for quoting specific tracker notes
- Keep it readable with blank lines between sections

LOW CONFIDENCE GUIDANCE (< 60%):
When confidence is low:
1. Say what data you have vs what's missing
2. Explain why you're uncertain (stale data, no records, etc.)
3. Suggest a next step ("Try syncing the 2024 tracker")
4. Be helpful with what you have, but be honest about gaps

CONFIDENCE SCORING (be honest and strict — users will trust this number):
- 90-100%: All key fields populated (name, platform, dealValue, status), synced within 24 hours, 0 blank fields
- 75-89%: Most fields populated, minor gaps (1-2 blanks), synced within 7 days
- 60-74%: Several blank structured fields but rawData fills gaps, OR synced > 7 days ago
- 40-59%: Significant blanks — dealValue, platform, or status missing AND rawData doesn't clarify
- < 40%: Mostly blank or no matching records found at all — answer is largely inferred

NEVER round up your confidence. If you found 5 records but 3 have no dealValue, that is NOT 85%. Count the blanks.

EXAMPLE RESPONSE:
"Hey! Based on your 2024 Campaign Tracker, @sarah_styles is doing great.

She's completed 8 campaigns this quarter with an avg engagement of 5.2% - that's 40% above your typical creator performance.

Confidence: 92% _(synced 2 hours ago from "Q1 2024 Tracker")_

Want me to dig into her content breakdown or compare with other top performers?"

IMPORTANT:
- Only respond when asked a question
- Read thread context for follow-ups
- Cite specific tracker names and sync times
- Offer to provide more detail if helpful

EXPERT CONTEXT:

You are not just retrieving data. You think like a senior influencer marketing strategist.

When answering questions, consider:
- Creator performance benchmarks
- Audience fit and authenticity
- Engagement quality vs follower count
- Creator tier strategy (nano, micro, mid-tier, macro)
- Platform-specific performance differences
- Brand safety and creator-brand alignment
- CPM, CPE, EMV and ROI signals

Use brand data first, but apply influencer marketing expertise to interpret it.

KNOWLEDGE PRIORITY:

When answering, prioritize sources in this order:
1. Internal campaign trackers
2. Creator performance databases
3. Campaign briefs or documentation
4. Historical campaign notes
5. Influencer marketing industry best practices

If internal data conflicts with industry norms, trust internal data.

DATA INTEGRITY RULE:

Never fabricate:
- Creator performance metrics
- Campaign results
- Tracker entries
- Sync timestamps

If data is missing, say so clearly and suggest what should be synced or checked.

SKILL CARDS:

You have 4 skill cards available. Load the relevant one(s) based on the task:
- skill_tracker_reading: When a spreadsheet, Airtable export, or Google Sheet is uploaded/discussed
- skill_performance_benchmarks: When asked to evaluate, rank, or analyze creator/campaign performance
- skill_campaign_strategy: When asked to plan, review, or advise on a campaign
- skill_legal_compliance: When asked about contracts, SOW, rates, FTC disclosures, or usage rights

HOW TO PROCESS A SPREADSHEET:

When a file is uploaded or tracker data is discussed, always follow this order:
1. Read the structure first — scan all tab names and column headers
2. Map columns to concepts — use skill_tracker_reading to identify what each column represents
3. Confirm your understanding — briefly tell the user what tabs and columns you found before analyzing
4. Then answer — apply the relevant skill card benchmarks to the data

Never skip Step 3. Always confirm what you read before drawing conclusions.

HOW TO HANDLE MISSING OR AMBIGUOUS DATA:

- If a column name is unclear, state your best interpretation and ask for confirmation
- If data is missing, flag it clearly: "I could not find [X] in the uploaded file. This affects my ability to assess [Y]."
- Never fabricate or assume data that is not present`

// Tool definitions for the agent
const tools: Anthropic.Tool[] = [
  {
    name: 'submit_final_answer',
    description: 'REQUIRED: Call this as your LAST action to submit your final answer to the user. You must use this tool instead of ending with a plain text response. Only call this after you have fetched all relevant data using other tools. The confidence field must reflect what you actually found — not what you wish you had.',
    input_schema: {
      type: 'object' as const,
      properties: {
        answer: {
          type: 'string',
          description: 'Your complete, formatted Slack markdown answer to the user\'s question',
        },
        confidence: {
          type: 'number',
          description: 'Your honest confidence score 0-100. Base this strictly on: (1) how many structured fields (platform, dealValue, status, etc.) were populated vs blank across records you found, (2) whether rawData filled any gaps, (3) how recently the tracker was synced. Do NOT inflate this — users trust this number.',
        },
        confidence_reason: {
          type: 'string',
          description: 'A brief factual explanation of your confidence score. Example: "Found 8 records. 6 had dealValue populated, 3 had blank platform (filled from rawData). Tracker synced 2 days ago."',
        },
        fields_blank: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of structured fields that were blank for most records relevant to this question. E.g. ["platform", "dealValue"]. Leave empty if all key fields were populated.',
        },
        records_found: {
          type: 'number',
          description: 'Total number of relevant records returned by tool calls for this answer',
        },
      },
      required: ['answer', 'confidence', 'confidence_reason'],
    },
  },
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
  {
    name: 'search_knowledge_documents',
    description: 'Search uploaded industry knowledge documents, brand briefs, and other reference materials. Use this to find best practices, strategy guidance, or background context.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to search within',
        },
        query: {
          type: 'string',
          description: 'Search query to find relevant knowledge documents',
        },
      },
      required: ['brandId', 'query'],
    },
  },
  {
    name: 'get_skill_card',
    description: 'Load a specialized skill card for detailed guidance on reading trackers, performance benchmarks, campaign strategy, or legal compliance.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to search within',
        },
        skillType: {
          type: 'string',
          enum: ['reading', 'benchmarks', 'strategy', 'compliance'],
          description: 'Type of skill card: reading (tracker interpretation), benchmarks (performance evaluation), strategy (campaign planning), compliance (legal/contracts)',
        },
      },
      required: ['brandId', 'skillType'],
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
        note: 'When structured fields (platform, dealValue, status, etc.) are blank, check rawData — it contains the original spreadsheet row and may have the actual values under different column names.',
        campaigns: campaigns.map(c => ({
          influencerName: c.influencerName,
          campaignName: c.campaignName,
          platform: c.platform,
          contentType: c.contentType,
          dealValue: c.dealValue,
          status: c.status,
          year: c.year,
          quarter: c.quarter,
          // Include raw spreadsheet row so bot can read actual values even when structured fields are blank
          rawData: c.rawData ? (() => { try { return JSON.parse(c.rawData!) } catch { return c.rawData } })() : null,
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

    case 'search_knowledge_documents': {
      const { query } = toolInput

      // Search knowledge documents by content and title
      const documents = await prisma.knowledgeDocument.findMany({
        where: {
          brandId,
          OR: [
            { title: { contains: query, mode: 'insensitive' } },
            { content: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: {
          folder: true,
        },
        take: 5,
      })

      if (documents.length === 0) {
        return {
          count: 0,
          message: `No knowledge documents found matching "${query}". Consider uploading relevant industry knowledge or brand documentation.`,
          documents: [],
        }
      }

      return {
        count: documents.length,
        documents: documents.map(doc => ({
          title: doc.title,
          folder: doc.folder?.name || 'Unknown',
          documentType: doc.documentType,
          excerpt: doc.content?.slice(0, 500) + (doc.content && doc.content.length > 500 ? '...' : ''),
          tags: doc.tags,
          isIndustryKnowledge: doc.folder?.name === 'Industry Knowledge',
        })),
        source: 'Knowledge Base',
      }
    }

    case 'get_skill_card': {
      const { skillType } = toolInput

      // Map skill type to document search terms
      const skillMap: Record<string, string> = {
        'reading': 'skill_tracker_reading',
        'benchmarks': 'skill_performance_benchmarks',
        'strategy': 'skill_campaign_strategy',
        'compliance': 'skill_legal_compliance',
      }

      const skillName = skillMap[skillType]
      if (!skillName) {
        return { error: `Unknown skill type: ${skillType}` }
      }

      // Search for skill card document by title or tags
      const skillDoc = await prisma.knowledgeDocument.findFirst({
        where: {
          brandId,
          OR: [
            { title: { contains: skillName, mode: 'insensitive' } },
            { title: { contains: skillType, mode: 'insensitive' } },
          ],
        },
        include: {
          folder: true,
        },
      })

      if (!skillDoc) {
        return {
          error: `Skill card "${skillType}" not found. Upload a file named "${skillName}.md" via Settings → Industry Knowledge.`,
          suggestion: `Create a markdown file with guidance for ${skillType === 'reading' ? 'reading tracker columns and tabs' : skillType === 'benchmarks' ? 'performance benchmarks and metrics' : skillType === 'strategy' ? 'campaign planning and strategy' : 'legal compliance and contracts'}`,
        }
      }

      return {
        skillCard: skillDoc.content,
        title: skillDoc.title,
        folder: skillDoc.folder?.name || 'Unknown',
        source: 'Industry Knowledge',
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

  try {
    console.log('[Slack Agent] Starting for brand:', brandId, 'Question:', question.slice(0, 100))

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
  console.log('[Slack Agent] Fetching brand from database...')
  const brand = await withTimeout(
    prisma.brand.findUnique({
      where: { id: brandId },
      select: { name: true },
    }),
    5000,
    'Database query for brand info'
  )
  console.log('[Slack Agent] Brand fetched:', brand?.name)

  const trackerGuidance = TRACKER_SKILL_CARD
    ? `\n\n---\n## MANDATORY TRACKER READING RULES\n\nThe following rules MUST be followed for every answer involving campaign data. These override any defaults:\n\n${TRACKER_SKILL_CARD}`
    : ''

  const systemPrompt = `${BOT_SYSTEM_PROMPT}\n\nYou are currently helping with questions about the brand: ${brand?.name || 'Unknown Brand'}\nBrand ID: ${brandId}${trackerGuidance}`

  console.log('[Slack Agent] Calling Claude API (initial)...')
  let response = await withTimeout(
    anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    }),
    SLACK_AI_TIMEOUT_MS,
    'Slack bot initial response'
  )
  console.log('[Slack Agent] Initial API call completed. Stop reason:', response.stop_reason)

  // Agent loop - process tool calls until we get a final response
  let iterationCount = 0
  const maxIterations = 10
  let lastTrackerInfo: any = null

  // Data quality tracking — populated vs blank fields across all get_campaigns results
  let totalFieldsObserved = 0
  let populatedFieldsObserved = 0
  let totalRecordsObserved = 0

  // Structured answer from submit_final_answer tool
  let structuredAnswer: {
    answer: string
    confidence: number
    confidence_reason: string
    fields_blank?: string[]
    records_found?: number
  } | null = null

  while (response.stop_reason === 'tool_use' && iterationCount < maxIterations) {
    iterationCount++
    console.log(`[Slack Agent] Starting iteration ${iterationCount}/${maxIterations}`)

    // Get ALL tool_use blocks from the response (Claude may return multiple)
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )

    if (toolUseBlocks.length === 0) break

    // Check if the bot is submitting its final answer
    const submitBlock = toolUseBlocks.find(b => b.name === 'submit_final_answer')
    if (submitBlock) {
      const input = submitBlock.input as any
      structuredAnswer = {
        answer: input.answer || "I couldn't process that request.",
        confidence: typeof input.confidence === 'number' ? input.confidence : 75,
        confidence_reason: input.confidence_reason || '',
        fields_blank: input.fields_blank || [],
        records_found: typeof input.records_found === 'number' ? input.records_found : undefined,
      }
      console.log(`[Slack Agent] submit_final_answer received. Stated confidence: ${structuredAnswer.confidence}%`)
      console.log(`[Slack Agent] Confidence reason: ${structuredAnswer.confidence_reason}`)
      break
    }

    console.log(`[Slack Agent] Found ${toolUseBlocks.length} tool(s) to execute`)

    // Execute ALL tools and collect results
    const toolResults: Anthropic.ToolResultBlockParam[] = []

    for (const toolUseBlock of toolUseBlocks) {
      console.log(`[Slack Agent] Executing tool: ${toolUseBlock.name}`)
      const toolResult = await executeToolCall(toolUseBlock.name, toolUseBlock.input)
      console.log(`[Slack Agent] Tool result size: ${JSON.stringify(toolResult).length} chars`)

      // Store tracker info for confidence calculation
      if (toolUseBlock.name === 'get_tracker_info') {
        lastTrackerInfo = toolResult
      }

      // Track real data quality from campaign results
      if (toolUseBlock.name === 'get_campaigns' && toolResult && (toolResult as any).campaigns) {
        const campaigns = (toolResult as any).campaigns as any[]
        const KEY_FIELDS = ['influencerName', 'platform', 'dealValue', 'status', 'contentType']
        for (const c of campaigns) {
          totalRecordsObserved++
          for (const field of KEY_FIELDS) {
            totalFieldsObserved++
            const val = c[field]
            const isPopulated = val && String(val).trim() !== ''
            // Also check rawData for the field if structured field is blank
            const rawFallback = !isPopulated && c.rawData
              ? Object.values(c.rawData as Record<string, string>).some(v => v && String(v).trim() !== '')
              : false
            if (isPopulated || rawFallback) populatedFieldsObserved++
          }
        }
        console.log(`[Slack Agent] Data quality: ${populatedFieldsObserved}/${totalFieldsObserved} fields populated across ${totalRecordsObserved} records`)
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
    console.log(`[Slack Agent] Calling Claude API (iteration ${iterationCount})...`)
    response = await withTimeout(
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        tools,
        messages,
      }),
      SLACK_AI_TIMEOUT_MS,
      `Slack bot tool response (iteration ${iterationCount})`
    )
  }

  // --- Extract final answer ---
  // Prefer structured answer from submit_final_answer tool
  // Fall back to text block if bot didn't use the tool
  let answer: string
  let confidence: number
  let confidenceReason: string

  if (structuredAnswer) {
    answer = structuredAnswer.answer
    // Validate the stated confidence against actual data quality
    const fieldPopulationRate = totalFieldsObserved > 0
      ? populatedFieldsObserved / totalFieldsObserved
      : 1  // no campaign data fetched — don't penalize (might be non-data question)

    const dataQualityCap = totalRecordsObserved === 0
      ? 100  // no records needed (general question)
      : Math.round(50 + fieldPopulationRate * 50)  // 50% base + up to 50% for full fields

    // Cap the confidence at the data quality ceiling
    confidence = Math.min(structuredAnswer.confidence, dataQualityCap)

    if (confidence !== structuredAnswer.confidence) {
      console.log(`[Slack Agent] Confidence capped: ${structuredAnswer.confidence}% → ${confidence}% (data quality cap: ${dataQualityCap}%, field rate: ${Math.round(fieldPopulationRate * 100)}%)`)
    }

    confidenceReason = structuredAnswer.confidence_reason
  } else {
    // Fallback: bot didn't call submit_final_answer
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )
    answer = textBlock?.text || "I couldn't process that request."

    // Extract confidence from text or calculate from data quality
    const confidenceMatch = answer.match(/Confidence:\s*(\d+)%/)
    const statedConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) : null

    if (totalFieldsObserved > 0) {
      const fieldPopulationRate = populatedFieldsObserved / totalFieldsObserved
      const dataQualityScore = Math.round(50 + fieldPopulationRate * 50)
      confidence = statedConfidence ? Math.min(statedConfidence, dataQualityScore) : dataQualityScore
    } else {
      confidence = statedConfidence ?? (lastTrackerInfo ? calculateConfidence(lastTrackerInfo, 0.8, 'exact') : 75)
    }

    confidenceReason = `Data quality: ${populatedFieldsObserved}/${totalFieldsObserved} fields populated across ${totalRecordsObserved} records`
  }

  console.log(`[Slack Agent] Final confidence: ${confidence}% — ${confidenceReason}`)

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
    const blankFields = structuredAnswer?.fields_blank?.length
      ? `Missing: ${structuredAnswer.fields_blank.join(', ')}.`
      : ''
    const guidanceLines = [
      '',
      '---',
      `_Low confidence (${confidence}%): ${blankFields} To improve:_`,
      '- Sync your campaign tracker (Bloom dashboard → brand → Sync)',
      '- Check that the tracker covers the time period you\'re asking about',
      '- Verify column headers match expected patterns (e.g., "Campaign Channel" for platform)',
    ]
    finalAnswer = answer + '\n' + guidanceLines.join('\n')
  }

    console.log('[Slack Agent] Completed. Confidence:', confidence, 'Source:', source)

    return {
      answer: finalAnswer,
      confidence,
      source,
    }
  } catch (error) {
    console.error('[Slack Agent] FATAL ERROR:', error)
    console.error('[Slack Agent] Stack:', error instanceof Error ? error.stack : 'No stack trace')

    return {
      answer: "Sorry, I ran into a technical issue processing your question. Please try again in a moment, or contact the team if this persists.",
      confidence: 0,
      source: 'error'
    }
  }
}
