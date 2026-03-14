import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'
import * as fs from 'fs'
import * as path from 'path'

// Load all skill cards from filesystem at startup and inject into every prompt
// This ensures the bot always has access to all skills without needing to call a tool
function loadSkillCards(): Record<string, string> {
  const skillFiles = {
    tracker_reading: 'skill_tracker_reading.md',
    performance_benchmarks: 'skill_performance_benchmarks.md',
    campaign_strategy: 'skill_campaign_strategy.md',
    legal_compliance: 'skill_legal_compliance.md',
    negotiation: 'skill_negotiation.md',
  }

  const loaded: Record<string, string> = {}
  for (const [key, filename] of Object.entries(skillFiles)) {
    try {
      const skillPath = path.join(process.cwd(), 'src', 'lib', 'skills', filename)
      loaded[key] = fs.readFileSync(skillPath, 'utf-8')
      console.log(`[Slack Agent] Loaded skill card: ${key}`)
    } catch {
      console.warn(`[Slack Agent] Could not load skill card: ${filename}`)
      loaded[key] = ''
    }
  }
  return loaded
}

const ALL_SKILL_CARDS = loadSkillCards()

// Build injected skills block for the system prompt (all skills, always active)
function buildSkillsBlock(): string {
  const sections: string[] = []
  const labels: Record<string, string> = {
    tracker_reading: 'TRACKER READING — Follow when any campaign/creator data is involved',
    performance_benchmarks: 'PERFORMANCE BENCHMARKS — Use when evaluating or ranking creators/campaigns',
    campaign_strategy: 'CAMPAIGN STRATEGY — Use when advising on planning, briefs, or recommendations',
    legal_compliance: 'LEGAL & COMPLIANCE — Use when discussing contracts, SOWs, rates, or FTC rules',
    negotiation: 'NEGOTIATION — Use when discussing deal terms, rates, SOW history, or helping write negotiation emails',
  }

  for (const [key, content] of Object.entries(ALL_SKILL_CARDS)) {
    if (content) {
      sections.push(`### SKILL: ${labels[key] || key}\n\n${content}`)
    }
  }

  if (sections.length === 0) return ''
  return `\n\n---\n## MANDATORY SKILL LIBRARY\n\nAll skills below are ALWAYS active. Apply the relevant skill(s) to every answer.\n\n${sections.join('\n\n---\n\n')}`
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Timeout for AI API calls — generous to allow deep multi-tool analysis
const SLACK_AI_TIMEOUT_MS = 90000  // 90 seconds max per AI call

async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

// Bot personality and system prompt
const BOT_SYSTEM_PROMPT = `You are Bloom, an expert influencer marketing analyst for the Superbloom team.

IDENTITY & ROLE:
You are not a chatbot that retrieves data. You are a senior influencer marketing strategist who happens to have direct access to all of Superbloom's campaign data. You think, interpret, and answer like a human expert who knows this data deeply — not like a system reporting database results.

TONE:
- Direct, confident, conversational — like a sharp colleague who knows the data cold
- Lead with the answer, then give context
- Never start with "I found X records" — just answer the question like a human would
- No emojis. No corporate speak.

---

HOW TO SEARCH (MANDATORY — follow every time):

For ANY question about a creator, campaign, deal, or brand performance:
1. Call get_campaigns and/or search_influencers — structured extracted data from the tracker
2. Call search_knowledge_documents — PDFs, presentations, meeting notes, brand briefs, performance insights, AND Slack messages (all searched at once)
3. Call get_tracker_info — to know which trackers and tabs exist, and when last synced
4. If steps 1-2 return blank fields or 0 results: call get_raw_tracker_data with the creator/topic as search. This returns EVERY original spreadsheet row with ALL columns — read it like opening the sheet directly.
5. If the user asks for "current", "latest", "right now" data, or if synced data seems outdated: call read_live_sheet to pull the current values straight from Google Sheets in real time.
6. For questions about team decisions, discussions, or strategy: ALSO call get_slack_channel_history — the connected Slack channel has real team conversations that often contain critical context not in the tracker.
7. Only after all relevant sources are checked: call submit_final_answer

You CANNOT say "no data found" without having searched campaigns, knowledge documents, AND raw tracker data.

WHAT EACH SOURCE CONTAINS:
- get_campaigns / search_influencers: Extracted campaign records (structured fields + full raw row)
- search_knowledge_documents: Uploaded PDFs, presentations, meeting notes, strategy docs, performance insights, influencer notes, brand learnings, AND Slack channel messages
- get_raw_tracker_data: The synced Google Sheet rows from the database — ALL tabs, ALL columns, as of last sync.
- read_live_sheet: Real-time direct read from Google Sheets. Use when the user says "check now", "latest data", or when synced data seems stale or missing something recent.
- get_slack_channel_history: Full history of the brand's connected Slack channel — team discussions, creator feedback, decisions, recommendations

MEETING NOTES & STRATEGIC QUESTIONS:

For questions about:
- Meeting decisions ("what did we decide about X?")
- Action items ("what are the next steps for Y?")
- Past discussions ("did we talk about Z?")
- Strategic recommendations based on meetings

ALWAYS search knowledge_documents with meeting-related terms. Meeting notes are stored with documentType "meeting_notes" and contain:
- Summary of the meeting
- Action items with assigned owners
- Key decisions made
- Next steps
- Participant names

When the user asks "what did we decide", "what are the action items", "next steps", or mentions "meeting" — prioritize searching the Knowledge Base.

HOW TO READ THE RAW SPREADSHEET (get_raw_tracker_data):

This tool returns the original Google Sheet rows exactly as they were — every column, every cell value. When you receive this data:
1. Read the columnHeaders list first — this tells you the full structure of the sheet (like scanning the header row in a spreadsheet)
2. For each row, read originalRow as if you're reading a spreadsheet row left to right
3. Use your marketing expertise to understand what each column means — the column names may not match standard field names but the data is all there
4. A row with a person's name, a dollar amount, a platform, and a content type IS a complete campaign record — even if those values are under unusual column names
5. Piece together the answer from what you actually see in the rows, not from what structured fields say

---

HOW TO READ TRACKER DATA (CRITICAL — READ THIS CAREFULLY):

There are two layers of data for every campaign record:
- EXTRACTED FIELDS (influencerName, platform, dealValue, status, contentType): These are auto-mapped guesses. They are often wrong, incomplete, or missing entirely. Do NOT treat them as authoritative.
- RAW DATA (originalRow / rawData): This is the actual spreadsheet row, every column, exactly as the team entered it. THIS IS THE SOURCE OF TRUTH.

Every tracker is structured differently. Your job is to learn the column structure of each tracker and read it like a human analyst would.

When you get data from get_raw_tracker_data:
1. First read columnHeaders — understand the full shape of the sheet. What are all the columns? What kind of information does this tracker track?
2. Then read each row's originalRow — every key-value pair is a column and its cell value
3. Apply marketing expertise to understand what each column means in context:
   - Don't force columns into 5 buckets. A tracker might have 20+ meaningful columns: "February Deliverables", "March Deliverables", "Exclusivity Window", "Gifting Value", "Usage Rights", "Story Views", "Link Clicks", etc.
   - Read ALL of them. All are potentially relevant to the question being asked.
4. When answering, draw from the FULL column picture — not just a subset of standard fields
5. If a column exists and has a value, it's data. Use it.

When you get data from get_campaigns:
- The rawData field in each record is the original row — same as above
- The extractedName/platform/dealValue fields are helpers, not truth
- Always cross-check extracted fields against rawData

NEVER say "structured fields are blank" — that's an internal system detail. Just read the raw data and answer.

---

HOW TO ANSWER:

RESPONSE LENGTH: Default to short. Most answers should be 3–6 sentences. Only go longer if the user explicitly asks for a full breakdown, analysis, or comparison. If you catch yourself writing more than 8 sentences unprompted — cut it.

Structure:
1. Direct answer to what was asked (1–2 sentences using the actual data)
2. Key supporting detail — the most important number, pattern, or context (2–3 sentences max)
3. One-line data note: _"From [Tracker Name], synced [date]"_
4. Skip any section that adds no new information. No padding, no summaries of what you already said.

For "full analysis" or "deep dive" requests: go deeper, but still be efficient — no repeated information, no restating the question.

CONFIDENCE SCORING (honest, but don't be overly conservative):
- 85-100%: Records found, key fields populated or readable from rawData, synced recently
- 65-84%: Records found, some fields blank that rawData doesn't clarify, or synced > 7 days ago
- 40-64%: Records found but most key fields blank even in rawData — answer is partial
- < 40%: No matching records found anywhere after thorough search

IMPORTANT: rawData with values counts as real data. If rawData has the creator's platform, rate, and deliverables, that is an 80%+ confidence answer — not 22%. Only drop below 50% if rawData is ALSO empty.

DO NOT append a low-confidence block with bullet points about syncing. If confidence is low, say it in one sentence naturally within your answer.

---

EXPERT CONTEXT:

Apply your influencer marketing expertise to every answer:
- Creator tier context (nano/micro/mid-tier/macro) based on follower count or rate
- Platform-specific performance norms (TikTok vs Instagram vs YouTube engagement benchmarks)
- Deal value interpretation (is this rate above/below market for this tier?)
- Deliverable patterns (what does 3 posts + 2 stories typically mean for a campaign?)
- Red flags: gaps in deliverables, missing contract terms, unusually low rates

Don't just read the data — interpret it. Give the Superbloom team the kind of answer a senior strategist would give after reviewing the spreadsheet themselves.

METRICS GLOSSARY (common numerical columns you'll see in trackers):

**CRITICAL RULE: Always read metrics directly from tracker columns when they exist. Only calculate as a fallback.**

When you receive tracker data (get_raw_tracker_data or get_campaigns):
1. First check originalRow/rawData for column names like "Revenue", "AOV", "ROAS", "CPA", "CTR", etc.
2. If the column exists with a value, USE THAT VALUE DIRECTLY — do not calculate
3. Only calculate metrics if the tracker doesn't have those columns pre-calculated

**PRIORITY METRICS (always highlight these first):**
- ROAS (Return on Ad Spend): Check for "ROAS" column first. If missing, calculate: Revenue ÷ Total Spend. This is THE most important metric. Measures campaign profitability. (e.g., 3.5x ROAS = earned $3.50 for every $1 spent). Good ROAS varies by industry but typically 2.5x+ is solid, 4x+ is excellent.
- CPA (Cost Per Acquisition): Check for "CPA" column first. If missing, calculate: Total Spend ÷ Number of Conversions. How much it costs to acquire one customer. (e.g., $45 CPA = spent $45 to get one purchase). Lower is better. Always compare to customer LTV.

**REVENUE & COST METRICS:**
- Revenue: Check for "Revenue" column first — this is usually the most accurate. Total dollar amount generated from sales attributed to the campaign (e.g., $15,000 revenue = customers spent $15k total)
- Deal Value / Payout: Total amount paid to creator for the campaign (organic payout + UGC payout + commission/affiliate earnings)
- CPM (Cost Per Mille): Check for "CPM" column first. Cost per 1000 impressions/views (e.g., $25 CPM = paid $25 for every 1000 people who saw the content)
- CPC (Cost Per Click): Check for "CPC" column first. If missing, calculate: Total Spend ÷ Link Clicks. Average cost per click on the campaign link (e.g., $2.50 CPC = paid $2.50 for each click)

**CONVERSION METRICS:**
- Sales / Conversions: Total number of purchases attributed to the campaign
- Conversion Rate: Check for "Conversion Rate" or "CVR" column first. If missing, calculate: (Conversions ÷ Link Clicks) × 100. Percentage of clicks that resulted in purchases (e.g., 3.5% = 35 purchases per 1000 clicks)
- AOV (Average Order Value): Check for "AOV" column first — DO NOT calculate if this column exists! If the tracker has an "AOV" column, use that value directly. Only calculate (Revenue ÷ Conversions) if the "AOV" column is missing. Average purchase amount per customer (e.g., $75 AOV means each customer spent $75 on average)

**ENGAGEMENT METRICS:**
- CTR (Click-Through Rate): Check for "CTR" column first. If missing, calculate: (Link Clicks ÷ Impressions) × 100. Percentage of viewers who clicked (e.g., 2.5% = 25 clicks per 1000 views)
- ER (Engagement Rate): Check for "ER" or "Engagement Rate" column first. If missing, calculate: (Total Engagements ÷ Followers) × 100. Percentage of followers who engaged (likes, comments, shares)
- Reach / Impressions: Number of unique people who saw the content / Total times content was displayed
- Link Clicks: Number of times campaign link was clicked

**WHEN ANALYZING CAMPAIGNS:**
1. First scan all available columns in originalRow — look for pre-calculated metrics like "ROAS", "CPA", "AOV", "Revenue", "CTR", etc.
2. Always lead with ROAS and CPA if available (from columns or calculated) — these determine campaign success
3. Then provide supporting context: Revenue (from column if exists), Conversions, AOV (from column if exists)
4. Finally, engagement metrics: CTR (from column if exists), Impressions, Clicks
5. Be explicit when reading from a column vs calculating: "Revenue: $4,135 (from tracker)" or "AOV: ~$129 (calculated from revenue ÷ orders)"

---

DATA PRIORITY:
1. Campaign tracker data (get_campaigns, search_influencers) — source of truth for all creator and campaign details
2. Knowledge Base (search_knowledge_documents) — performance notes, insights, uploaded briefs, strategic learnings
3. Skill cards (always active in this prompt) — benchmarks and best practices for interpretation

If internal data conflicts with industry norms, trust internal data.

---

NEVER fabricate metrics, campaign results, or sync timestamps. If something genuinely isn't in the data, say so briefly and move on.

SLACK FORMATTING:
- Use *bold* for creator names, key numbers, and important data points
- Use _italic_ for source/sync info
- Bullet lists only when listing 3+ items that genuinely need breaking out — not for 2-item comparisons
- Keep it tight — blank lines between sections only, not between every sentence
- Never use headers (###) or horizontal rules (---) in Slack responses`

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
    description: 'IMPORTANT: Search the Knowledge Base for documents, influencer notes, campaign insights, brand learnings, AND MEETING NOTES. This searches across ALL knowledge sources including uploaded meeting notes with action items, decisions, and next steps. ALWAYS call this alongside get_campaigns/search_influencers for any creator or campaign question. For meeting-related questions ("what did we decide?", "action items", "next steps"), this is THE primary source.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to search within',
        },
        query: {
          type: 'string',
          description: 'Search query to find relevant knowledge documents. For meeting notes, try: meeting + topic, action items, decisions, or participant names.',
        },
      },
      required: ['brandId', 'query'],
    },
  },
  {
    name: 'get_slack_channel_history',
    description: 'Read messages from the brand\'s connected Slack channel (stored in the database). Use this to find team discussions about creators, campaigns, decisions, or any topic. The team often discusses strategy and feedback directly in Slack — this is valuable context for answering questions.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to query',
        },
        search: {
          type: 'string',
          description: 'Optional: filter messages to those containing this text (case-insensitive)',
        },
        limit: {
          type: 'number',
          description: 'Max messages to return (default 50, max 200)',
        },
      },
      required: ['brandId'],
    },
  },
  {
    name: 'get_raw_tracker_data',
    description: 'Read the actual raw spreadsheet rows exactly as they appear in the original Google Sheet — with all original column headers and cell values. Use this when you need to understand the sheet structure, find data that may not have mapped to standard fields, or read a creator\'s full row in context. This is the closest thing to opening the spreadsheet yourself.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID to query',
        },
        search: {
          type: 'string',
          description: 'Optional: filter rows to those containing this text anywhere in any column (case-insensitive). Leave blank to get a sample of all rows.',
        },
        limit: {
          type: 'number',
          description: 'Max rows to return (default 100, max 300). For a structural overview, use 20-30. For a specific creator, use 50.',
        },
      },
      required: ['brandId'],
    },
  },
  {
    name: 'read_live_sheet',
    description: 'Read the CURRENT live data directly from the connected Google Sheet — bypasses the database entirely and fetches fresh rows in real time. Use this when: (1) the user asks about something that might have changed since the last sync, (2) the user says "check the tracker now" or "latest data", (3) get_raw_tracker_data returns stale or missing results. Returns the actual live cell values for a specific tab or a search term across all tabs.',
    input_schema: {
      type: 'object',
      properties: {
        brandId: {
          type: 'string',
          description: 'The brand ID whose tracker to read',
        },
        tabName: {
          type: 'string',
          description: 'Optional: name of the specific tab to read (e.g. "Campaign Tracker", "Paid Usage"). If omitted, reads the first/main tab.',
        },
        search: {
          type: 'string',
          description: 'Optional: filter rows to those containing this text in any cell (case-insensitive). Use to find a specific creator or campaign.',
        },
        maxRows: {
          type: 'number',
          description: 'Max rows to return (default 100, max 300).',
        },
      },
      required: ['brandId'],
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
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ]
      }

      const influencers = await prisma.brandInfluencer.findMany({
        where,
        orderBy: { totalCampaigns: 'desc' },
        take: 10,
      })

      // FALLBACK: If no influencers found in BrandInfluencer, search CampaignRecord for the name
      let campaignMatches: any[] = []
      if (influencers.length === 0 && query) {
        console.log(`[Slack Agent] No influencers found for "${query}" in BrandInfluencer, searching CampaignRecord...`)
        const searchTerms = query.toLowerCase().split(/\s+/)

        // Search structured influencerName field
        const campaignRecords = await prisma.campaignRecord.findMany({
          where: {
            brandId,
            influencerName: { contains: query, mode: 'insensitive' },
          },
          take: 20,
        })

        // Also search rawData if structured search fails
        if (campaignRecords.length === 0) {
          const allRecords = await prisma.campaignRecord.findMany({
            where: { brandId },
            take: 500,
          })
          const rawMatches = allRecords.filter(c => {
            if (c.rawData) {
              try {
                const raw = typeof c.rawData === 'string' ? JSON.parse(c.rawData) : c.rawData
                const allValues = Object.values(raw as Record<string, any>).map(v => String(v || '').toLowerCase())
                const fullText = allValues.join(' ')
                return searchTerms.every((term: string) => fullText.includes(term)) ||
                  searchTerms.some((term: string) => fullText.includes(term) && term.length >= 3)
              } catch { return false }
            }
            return false
          })
          campaignMatches = rawMatches.slice(0, 10)
        } else {
          campaignMatches = campaignRecords.slice(0, 10)
        }

        if (campaignMatches.length > 0) {
          console.log(`[Slack Agent] Found ${campaignMatches.length} campaign records matching "${query}" via fallback`)
        }
      }

      return {
        count: influencers.length,
        influencers: influencers.map(i => ({
          name: i.name,
          email: i.email,
          platform: i.platform,
          totalCampaigns: i.totalCampaigns,
          estimatedRate: i.estimatedRate,
          cohort: i.cohort,
          deliverables: i.deliverables,
          term: i.term,
          paidUsageTerms: i.paidUsageTerms,
          engagementRate: i.engagementRate,
          followerCount: i.followerCount,
        })),
        // Include campaign record matches if BrandInfluencer had no results
        ...(campaignMatches.length > 0 ? {
          note: `No dedicated influencer profile found, but found ${campaignMatches.length} campaign records matching "${query}". Data from campaign records:`,
          campaignRecordMatches: campaignMatches.map(c => ({
            influencerName: c.influencerName,
            campaignName: c.campaignName,
            platform: c.platform,
            dealValue: c.dealValue,
            status: c.status,
            contentType: c.contentType,
            rawData: c.rawData ? (() => { try { return JSON.parse(c.rawData!) } catch { return c.rawData } })() : null,
          })),
        } : influencers.length === 0 ? {
          note: `No results found for "${query}" in influencer profiles or campaign records. Try search_knowledge_documents to check the Knowledge Base, or get_campaigns without a name filter to browse all records.`,
        } : {}),
      }
    }

    case 'get_campaigns': {
      const { year, status, influencerName, limit = 50 } = toolInput

      const where: any = { brandId }

      if (year) where.year = year
      if (status) where.status = { contains: status, mode: 'insensitive' }
      if (influencerName) where.influencerName = { contains: influencerName, mode: 'insensitive' }

      let campaigns = await prisma.campaignRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      })

      // FALLBACK: If filtering by influencerName returned 0 results, search rawData for the name
      if (campaigns.length === 0 && influencerName) {
        console.log(`[Slack Agent] No campaigns found for "${influencerName}" in structured fields, searching rawData...`)
        const allCampaigns = await prisma.campaignRecord.findMany({
          where: { brandId, ...(year ? { year } : {}) },
          orderBy: { createdAt: 'desc' },
          take: 500,
        })

        // Search through rawData for the influencer name (case-insensitive, partial match)
        const searchTerms = influencerName.toLowerCase().split(/\s+/)
        campaigns = allCampaigns.filter(c => {
          // Check structured influencerName with partial match
          if (c.influencerName) {
            const name = c.influencerName.toLowerCase()
            if (searchTerms.every((term: string) => name.includes(term))) return true
            // Also match if any single search term is a close match (e.g. "Helen" matches "Helen L.")
            if (searchTerms.some((term: string) => name.includes(term) && term.length >= 3)) return true
          }
          // Check rawData for the name in any field value
          if (c.rawData) {
            try {
              const raw = typeof c.rawData === 'string' ? JSON.parse(c.rawData) : c.rawData
              const allValues = Object.values(raw as Record<string, any>).map(v => String(v || '').toLowerCase())
              const fullText = allValues.join(' ')
              if (searchTerms.every((term: string) => fullText.includes(term))) return true
              if (searchTerms.some((term: string) => fullText.includes(term) && term.length >= 3)) return true
            } catch { /* ignore parse errors */ }
          }
          return false
        }).slice(0, limit)

        if (campaigns.length > 0) {
          console.log(`[Slack Agent] rawData fallback found ${campaigns.length} campaigns for "${influencerName}"`)
        }
      }

      return {
        count: campaigns.length,
        note: campaigns.length === 0 && influencerName
          ? `No campaigns found for "${influencerName}" in structured fields OR rawData. The name might be stored differently. Try searching knowledge_documents or getting all campaigns without a name filter to browse.`
          : 'When structured fields (platform, dealValue, status, etc.) are blank, check rawData — it contains the original spreadsheet row and may have the actual values under different column names.',
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
        note: 'When structured fields are blank, check rawData for original spreadsheet values.',
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
          rawData: c.rawData ? (() => { try { return JSON.parse(c.rawData!) } catch { return c.rawData } })() : null,
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

      // ALSO search related data models for richer context
      const [influencerNotes, campaignInsights, brandLearnings] = await Promise.all([
        prisma.influencerNote.findMany({
          where: {
            brandId,
            OR: [
              { content: { contains: query, mode: 'insensitive' } },
              { noteType: { contains: query, mode: 'insensitive' } },
              { influencer: { name: { contains: query, mode: 'insensitive' } } },
            ],
          },
          include: { influencer: { select: { name: true } } },
          take: 10,
        }).catch(() => []),
        prisma.campaignInsight.findMany({
          where: {
            brandId,
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { category: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: 5,
        }).catch(() => []),
        prisma.brandLearning.findMany({
          where: {
            brandId,
            OR: [
              { title: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { recommendation: { contains: query, mode: 'insensitive' } },
            ],
          },
          take: 5,
        }).catch(() => []),
      ])

      // ALSO search Slack channel messages for team discussions
      const slackMessages = await prisma.slackMessage.findMany({
        where: {
          brandId,
          content: { contains: query, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }).catch(() => [])

      const totalResults = documents.length + influencerNotes.length + campaignInsights.length + brandLearnings.length + slackMessages.length

      if (totalResults === 0) {
        return {
          count: 0,
          message: `No knowledge documents, influencer notes, insights, learnings, or Slack messages found matching "${query}". Check if documents have been uploaded to the Knowledge Base or if the Slack channel has been synced.`,
          documents: [],
          influencerNotes: [],
          campaignInsights: [],
          brandLearnings: [],
          slackMessages: [],
        }
      }

      return {
        count: totalResults,
        documents: documents.map(doc => ({
          title: doc.title,
          folder: doc.folder?.name || 'Unknown',
          documentType: doc.documentType,
          excerpt: doc.content?.slice(0, 3000) + (doc.content && doc.content.length > 3000 ? '...' : ''),
          tags: doc.tags,
          isIndustryKnowledge: doc.folder?.name === 'Industry Knowledge',
        })),
        influencerNotes: influencerNotes.map((n: any) => ({
          influencerName: n.influencer?.name || 'Unknown',
          content: n.content,
          noteType: n.noteType,
          sentiment: n.sentiment,
        })),
        campaignInsights: campaignInsights.map((i: any) => ({
          title: i.title,
          description: i.description,
          category: i.category,
          sentiment: i.sentiment,
        })),
        brandLearnings: brandLearnings.map((l: any) => ({
          title: l.title,
          description: l.description,
          recommendation: l.recommendation,
          category: l.category,
        })),
        slackMessages: slackMessages.map((m: any) => ({
          user: m.userName || 'Team Member',
          text: m.content,
          timestamp: m.createdAt,
        })),
        source: 'Knowledge Base + Slack Channel + Related Data',
      }
    }

    case 'get_slack_channel_history': {
      const { search, limit = 50 } = toolInput
      const cap = Math.min(limit, 200)
      const searchLower = search?.toLowerCase()

      const messages = await prisma.slackMessage.findMany({
        where: {
          brandId,
          ...(searchLower ? {
            content: { contains: search, mode: 'insensitive' },
          } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: cap,
      })

      // Reverse to chronological order
      const chronological = [...messages].reverse()

      if (chronological.length === 0) {
        return {
          count: 0,
          message: search
            ? `No Slack messages found mentioning "${search}". The channel may not have been synced yet, or no one has discussed this topic.`
            : 'No Slack messages found. The channel may not have been synced yet.',
          messages: [],
        }
      }

      return {
        count: chronological.length,
        note: 'These are real messages from the brand\'s connected Slack channel. Team discussions here often contain context about creator relationships, campaign decisions, and strategic direction.',
        messages: chronological.map(m => ({
          user: m.userName || 'Team Member',
          text: m.content,
          timestamp: m.createdAt,
          isThread: !!m.threadTs,
        })),
      }
    }

    case 'get_raw_tracker_data': {
      const { search, limit = 100 } = toolInput
      const cap = Math.min(limit, 300)

      // Fetch all campaign records with rawData for this brand
      const allRecords = await prisma.campaignRecord.findMany({
        where: { brandId },
        include: {
          tracker: { select: { label: true, year: true, lastSyncedAt: true } },
        },
        orderBy: { createdAt: 'asc' },
        take: search ? 2000 : cap, // fetch more when searching so we can filter
      })

      // Parse rawData and optionally filter by search term
      const searchLower = search?.toLowerCase()
      const rows = allRecords
        .map(r => {
          let raw: Record<string, any> = {}
          if (r.rawData) {
            try { raw = typeof r.rawData === 'string' ? JSON.parse(r.rawData) : (r.rawData as any) } catch { raw = {} }
          }
          return {
            trackerLabel: r.tracker?.label || 'Unknown Tracker',
            trackerYear: r.tracker?.year,
            lastSynced: r.tracker?.lastSyncedAt,
            // Structured fields (may be blank if extraction missed them)
            extractedName: r.influencerName || null,
            extractedPlatform: r.platform || null,
            extractedDealValue: r.dealValue || null,
            extractedStatus: r.status || null,
            // The full original row — every column exactly as it appeared in the sheet
            originalRow: raw,
          }
        })
        .filter(r => {
          if (!searchLower) return true
          // Check extracted fields
          const structuredText = [r.extractedName, r.extractedPlatform, r.extractedStatus].join(' ').toLowerCase()
          if (structuredText.includes(searchLower)) return true
          // Check every raw cell value
          const rawText = Object.values(r.originalRow).map(v => String(v || '').toLowerCase()).join(' ')
          return rawText.includes(searchLower)
        })
        .slice(0, cap)

      // Collect all unique column headers seen across rows so the bot understands the sheet structure
      const allHeaders = new Set<string>()
      rows.forEach(r => Object.keys(r.originalRow).forEach(k => allHeaders.add(k)))

      // Group by tracker for context
      const trackerGroups: Record<string, { lastSynced: Date | null, rowCount: number }> = {}
      rows.forEach(r => {
        const key = `${r.trackerLabel} (${r.trackerYear || 'year unknown'})`
        if (!trackerGroups[key]) trackerGroups[key] = { lastSynced: r.lastSynced || null, rowCount: 0 }
        trackerGroups[key].rowCount++
      })

      return {
        totalRowsReturned: rows.length,
        trackers: Object.entries(trackerGroups).map(([name, info]) => ({
          name,
          lastSynced: info.lastSynced,
          rowsInThisResult: info.rowCount,
        })),
        columnHeaders: Array.from(allHeaders),
        note: 'originalRow contains every column from the spreadsheet exactly as stored. Use column names and values to interpret what each row represents, even when extractedName/extractedPlatform etc. are blank.',
        rows: rows.map(r => ({
          extractedName: r.extractedName,
          extractedPlatform: r.extractedPlatform,
          extractedDealValue: r.extractedDealValue,
          extractedStatus: r.extractedStatus,
          originalRow: r.originalRow,
        })),
      }
    }

    case 'read_live_sheet': {
      // Fetch live data directly from Google Sheets — no DB, always fresh
      const { tabName, search, maxRows = 100 } = toolInput
      const cap = Math.min(maxRows, 300)

      try {
        const { discoverAllTabs, fetchAllTabs, extractSpreadsheetId } = await import('./google-sheets-public')

        // Find the brand's tracker(s)
        const trackers = await prisma.campaignTracker.findMany({
          where: { brandId },
          select: { spreadsheetId: true, label: true, lastSyncedAt: true },
        })

        if (trackers.length === 0) {
          return { error: 'No campaign tracker connected to this brand.' }
        }

        const tracker = trackers[0] // Use first tracker
        const tabs = await discoverAllTabs(tracker.spreadsheetId)

        // Find the right tab
        let targetTabs = tabs
        if (tabName) {
          const match = tabs.find(t => t.tabName.toLowerCase().includes(tabName.toLowerCase()))
          if (match) targetTabs = [match]
        }

        const tabData = await fetchAllTabs(tracker.spreadsheetId, targetTabs.slice(0, 3)) // limit to 3 tabs max

        // Flatten all rows with tab context
        const searchLower = search?.toLowerCase()
        const allRows: any[] = []

        for (const tab of tabData) {
          for (const row of tab.rows) {
            const rowData = row.data
            if (searchLower) {
              const text = Object.values(rowData).map(v => String(v || '').toLowerCase()).join(' ')
              if (!text.includes(searchLower)) continue
            }
            allRows.push({ tab: tab.tabName, ...rowData })
            if (allRows.length >= cap) break
          }
          if (allRows.length >= cap) break
        }

        const allHeaders = new Set<string>()
        allRows.forEach(r => Object.keys(r).forEach(k => allHeaders.add(k)))

        return {
          source: 'LIVE Google Sheet (real-time)',
          spreadsheetId: tracker.spreadsheetId,
          lastSynced: tracker.lastSyncedAt,
          tabsRead: tabData.map(t => t.tabName),
          totalRowsFound: allRows.length,
          columnHeaders: Array.from(allHeaders),
          rows: allRows,
          note: search ? `Filtered to rows containing "${search}"` : 'All rows (up to cap)',
        }
      } catch (error: any) {
        return {
          error: `Failed to read live sheet: ${error.message}`,
          suggestion: 'The sheet may not be publicly accessible, or there was a network error. Try get_raw_tracker_data instead.',
        }
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

  const skillsBlock = buildSkillsBlock()
  const systemPrompt = `${BOT_SYSTEM_PROMPT}\n\nYou are currently helping with questions about the brand: ${brand?.name || 'Unknown Brand'}\nBrand ID: ${brandId}${skillsBlock}`

  console.log('[Slack Agent] Calling Claude API (initial)...')
  let response = await withTimeout(
    anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
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
  const maxIterations = 15
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
          // Count how many rawData keys have actual values (full row data quality)
          const rawDataValueCount = c.rawData
            ? Object.values(c.rawData as Record<string, any>).filter(v => v && String(v).trim() !== '').length
            : 0
          const rawDataHasContent = rawDataValueCount >= 2  // at least 2 populated columns in raw row

          for (const field of KEY_FIELDS) {
            totalFieldsObserved++
            const val = c[field]
            const isPopulated = val && String(val).trim() !== ''
            // rawData with ≥2 populated columns means the row has real data, even if structured mapping is incomplete
            if (isPopulated || rawDataHasContent) populatedFieldsObserved++
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
        max_tokens: 16384,
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
    // Validate stated confidence against actual data quality
    const fieldPopulationRate = totalFieldsObserved > 0
      ? populatedFieldsObserved / totalFieldsObserved
      : 1  // no campaign data fetched — don't penalize (general question)

    // Data quality floor: if records were found, minimum confidence is 40%
    // Data quality cap: scales with field population rate
    const dataQualityCap = totalRecordsObserved === 0
      ? 100  // no records needed
      : Math.round(40 + fieldPopulationRate * 55)  // 40% floor + up to 55% for full data

    confidence = Math.min(structuredAnswer.confidence, dataQualityCap)
    // If records were found but AI undershoots, apply a floor
    if (totalRecordsObserved > 0 && fieldPopulationRate >= 0.5 && confidence < 45) {
      confidence = 45
    }

    if (confidence !== structuredAnswer.confidence) {
      console.log(`[Slack Agent] Confidence adjusted: ${structuredAnswer.confidence}% → ${confidence}% (cap: ${dataQualityCap}%, field rate: ${Math.round(fieldPopulationRate * 100)}%)`)
    }

    confidenceReason = structuredAnswer.confidence_reason
  } else {
    // Fallback: bot didn't call submit_final_answer
    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    )
    answer = textBlock?.text || "I couldn't process that request."

    const confidenceMatch = answer.match(/Confidence:\s*(\d+)%/)
    const statedConfidence = confidenceMatch ? parseInt(confidenceMatch[1]) : null

    if (totalFieldsObserved > 0) {
      const fieldPopulationRate = populatedFieldsObserved / totalFieldsObserved
      const dataQualityScore = Math.round(40 + fieldPopulationRate * 55)
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

  // No clunky footer — the answer itself handles low confidence naturally
  const finalAnswer = answer

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
