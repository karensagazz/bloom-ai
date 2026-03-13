// Campaign Data Extractor
// Uses AI (Claude Sonnet) to extract structured campaign and influencer data from spreadsheet rows

import { PrismaClient } from '@prisma/client'
import { getCheapStructuredCompletion, parseJSONResponse } from './ai'

// Extracted campaign record type
export interface ExtractedCampaignRecord {
  influencerName?: string
  handle?: string           // Instagram/social media handle
  campaignName?: string
  platform?: string
  contentType?: string
  dealValue?: string
  status?: string
  quarter?: string
  rawData?: Record<string, string | number>
}

// Extracted SOW (Statement of Work) record type
export interface ExtractedSOWRecord {
  influencerName?: string
  handle?: string            // Instagram/social media handle
  campaignName?: string
  platform?: string
  contractType?: string      // flat_fee, cpm, hybrid, usage_rights, talent_fee
  dealValue?: string
  deliverables?: Array<{ type: string; quantity: number; platform?: string }>
  paymentTerms?: string      // net_30, net_60, upon_delivery, 50_upfront
  usageRights?: string       // organic_only, paid_usage, perpetual, 1_year
  exclusivity?: string       // none, category_exclusive, full_exclusive
  startDate?: string
  endDate?: string
  status?: string
  rawData?: Record<string, string | number>
}

// Parse deal value string to cents (for aggregation)
export function parseValueToCents(valueStr: string | undefined): number | null {
  if (!valueStr) return null

  // Handle "K" suffix (e.g., "$5K", "5k")
  const kMatch = valueStr.toLowerCase().match(/(\d+(?:\.\d+)?)\s*k/)
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000 * 100)
  }

  // Remove currency symbols and non-numeric chars except decimal
  const numStr = valueStr.replace(/[^0-9.]/g, '')
  const num = parseFloat(numStr)

  if (isNaN(num)) return null

  // Convert to cents
  return Math.round(num * 100)
}

// Internal team members to exclude from influencer extraction
const INTERNAL_TEAM_MEMBERS = [
  'amanda knoll',
  'clara freitas',
  'clara',
  'gabrielly sudario',
  'gabrielly',
  'rachel velazquez',
  'rachel',
  'karen sagaz',
  'karen',
  'lauren kim',
  'lauren',
  'lily comba',
  'lily',
  'julia schwarz',
  'julia',
  'jenn echols',
  'jenn',
  'isabela',
]

// Check if a name belongs to an internal team member
function isInternalTeamMember(name: string | null | undefined): boolean {
  if (!name) return false
  const normalized = name.toLowerCase().trim()
  return INTERNAL_TEAM_MEMBERS.some(member =>
    normalized.includes(member) || member.includes(normalized)
  )
}

// Process a single batch of rows through AI extraction
async function extractCampaignBatch(
  brandName: string,
  tabName: string,
  headers: string[],
  batchRows: Record<string, string | number>[],
  batchIndex: number,
  totalRows: number,
  year?: number
): Promise<ExtractedCampaignRecord[]> {

  const systemPrompt = `You are a data extraction assistant that analyzes influencer marketing campaign tracker spreadsheets.
Your job is to identify which columns contain relevant campaign data and extract structured records.

You must respond with ONLY valid JSON - no explanations or markdown.`

  const userPrompt = `Analyze this campaign tracker spreadsheet tab for the brand "${brandName}".

Tab name: "${tabName}"
${year ? `Year: ${year}` : ''}

Column headers: ${JSON.stringify(headers)}

Data rows (batch ${batchIndex + 1}, ${batchRows.length} rows of ${totalRows} total):
${JSON.stringify(batchRows, null, 2)}

COLUMN MAPPING RULES:
- SKIP these columns if present: "Owner" (campaign manager/internal field only)
- For platform: Look for "Campaign Channel" column FIRST
  - This contains platform names: Instagram, TikTok, YouTube, Twitter/X
  - If "Campaign Channel" not found, try fallback names: "Platform", "Channel", "Social"
- For handle: Use FUZZY matching for social media handles
  - Column names might be: "Handle", "Instagram Handle", "IG Handle", "Social Handle", "@Handle", "Username", "Account", "Handle_IG"
  - Look for ANY column containing the word "handle" (case-insensitive)
  - Extract the @username or handle value from the cell
- For status: Handle binary and standard values:
  - "active" → map to "Active"
  - "not active" → map to "Completed"
  - Keep other values as-is (e.g., "In Progress", "Pending", "Cancelled")

TASK: Extract each row as a structured campaign record. Identify columns that map to:
- influencerName: the creator/influencer name (might be called "Creator", "Influencer", "Name", "Talent", etc.)
- handle: social media handle/username (look for columns containing "handle", "@", "username", "account" - use FUZZY matching)
- platform: Look for "Campaign Channel" column specifically - contains platform names like Instagram, TikTok, YouTube, Twitter/X
- contentType: Post, Story, Reel, Video, UGC, etc.
- dealValue: the fee/payment/budget (as a string, e.g., "$5,000" or "5000"). Use the creator name and content scope from the same row to accurately identify the deal value
- status: Look for "active" or "not active" values (map to "Active"/"Completed"), or preserve other status values (Completed, In Progress, Pending, etc.)
- campaignName: campaign/product name if present
- quarter: Q1, Q2, Q3, Q4 if identifiable

IMPORTANT RULES:
1. If this tab doesn't contain campaign/influencer data (e.g., it's a budget summary, notes, or template), return an empty array []
2. Skip rows that appear to be totals, headers, or empty
3. If a column doesn't exist, omit that field (don't guess)
4. SKIP columns named "Owner" - that's an internal campaign manager field, not campaign data. DO NOT skip "Campaign" or "Content" columns - they often contain campaign name and content type data
5. The "Campaign Channel" column is the PRIMARY source for platform information
6. Status mapping: "active" → "Active", "not active" → "Completed", preserve all other status values
7. When extracting deal values, consider the creator name and deliverable scope in the same row for accuracy
8. Preserve the original deal value format (don't convert currencies)
9. Extract ALL rows that contain campaign data

Return a JSON array with this structure:
[
  {
    "influencerName": "Creator Name",
    "handle": "@creatorhandle",
    "platform": "Instagram",
    "contentType": "Reel",
    "dealValue": "$5,000",
    "status": "Completed",
    "campaignName": "Summer Launch",
    "quarter": "Q2"
  }
]

If no campaign data found, return: []`

  // LOG: What we're sending to AI
  console.log(`[Campaign Extract] Tab: "${tabName}" batch ${batchIndex + 1} | Headers: ${headers.length} | Batch rows: ${batchRows.length}`)

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`❌ Tab "${tabName}" batch ${batchIndex + 1} did not return an array, skipping`)
      return []
    }

    // LOG: What AI returned
    if (parsed.length === 0) {
      console.log(`⚠️  Tab "${tabName}" batch ${batchIndex + 1}: AI returned 0 records`)
    } else {
      console.log(`✅ Tab "${tabName}" batch ${batchIndex + 1}: Extracted ${parsed.length} campaign records`)
    }

    // Map back to include raw data — try to match by influencerName for accuracy
    const mapped = parsed.map((record: any, index: number) => {
      // Try to find the matching raw row by influencer name
      let rawRow = batchRows[index]  // default: positional match
      if (record.influencerName) {
        const nameMatch = batchRows.find(r => {
          const vals = Object.values(r)
          return vals.some(v => v && String(v).toLowerCase().trim() === record.influencerName.toLowerCase().trim())
        })
        if (nameMatch) rawRow = nameMatch
      }

      return {
        influencerName: record.influencerName || undefined,
        handle: record.handle || undefined,
        campaignName: record.campaignName || undefined,
        platform: record.platform || undefined,
        contentType: record.contentType || undefined,
        dealValue: record.dealValue || undefined,
        status: record.status || undefined,
        quarter: record.quarter || undefined,
        rawData: rawRow || undefined,
      }
    })

    // Filter out internal team members
    const filtered = mapped.filter(record => {
      if (isInternalTeamMember(record.influencerName)) {
        console.log(`⏭️  Filtered out internal team member: ${record.influencerName}`)
        return false
      }
      return true
    })

    if (filtered.length < mapped.length) {
      console.log(`   Filtered ${mapped.length - filtered.length} internal team members`)
    }

    return filtered
  } catch (error) {
    console.error(`Failed to extract records from tab "${tabName}" batch ${batchIndex + 1}:`, error)
    return []
  }
}

// Extract campaign records from spreadsheet tab data using AI
// Processes rows in batches to avoid token limit truncation
const EXTRACTION_BATCH_SIZE = 40

export async function extractCampaignRecords(
  brandName: string,
  tabName: string,
  headers: string[],
  rows: Record<string, string | number>[],
  year?: number
): Promise<ExtractedCampaignRecord[]> {
  // Skip tabs with no data
  if (rows.length === 0 || headers.length === 0) {
    return []
  }

  console.log(`[Campaign Extract] Tab: "${tabName}" | ${rows.length} total rows | processing in batches of ${EXTRACTION_BATCH_SIZE}`)

  const allRecords: ExtractedCampaignRecord[] = []

  // Process rows in batches to stay within AI token limits
  for (let i = 0; i < rows.length; i += EXTRACTION_BATCH_SIZE) {
    const batchRows = rows.slice(i, i + EXTRACTION_BATCH_SIZE)
    const batchIndex = Math.floor(i / EXTRACTION_BATCH_SIZE)

    const batchRecords = await extractCampaignBatch(
      brandName,
      tabName,
      headers,
      batchRows,
      batchIndex,
      rows.length,
      year
    )

    allRecords.push(...batchRecords)
  }

  console.log(`[Campaign Extract] Tab "${tabName}" total: ${allRecords.length} records from ${rows.length} rows`)
  return allRecords
}

// Process a single batch of SOW rows through AI extraction
async function extractSOWBatch(
  brandName: string,
  tabName: string,
  headers: string[],
  batchRows: Record<string, string | number>[],
  batchIndex: number,
  totalRows: number,
  year?: number,
  platformFromTab?: string
): Promise<ExtractedSOWRecord[]> {
  const systemPrompt = `You are a data extraction assistant specializing in influencer marketing contracts and SOW (Statement of Work) documents.
Your job is to identify contract/deal information and extract structured records.
You must respond with ONLY valid JSON - no explanations or markdown.`

  const userPrompt = `Analyze this SOW (Statement of Work) spreadsheet tab for the brand "${brandName}".

Tab name: "${tabName}"
${year ? `Year: ${year}` : ''}
${platformFromTab ? `Primary Platform: ${platformFromTab}` : ''}

Column headers: ${JSON.stringify(headers)}

Data rows (batch ${batchIndex + 1}, ${batchRows.length} rows of ${totalRows} total):
${JSON.stringify(batchRows, null, 2)}

TASK: Extract each row as a structured SOW/contract record. Look for columns that map to:

CONTRACT IDENTIFICATION:
- influencerName: Creator/influencer name or handle
- campaignName: Campaign, project, or product name
- platform: Instagram, TikTok, YouTube, etc.

CONTRACT TERMS:
- contractType: Type of deal (flat_fee, cpm, hybrid, usage_rights, talent_fee, etc.)
- dealValue: Total fee/payment as string (e.g., "$5,000")
- paymentTerms: Payment schedule (net_30, net_60, upon_delivery, 50_upfront, etc.)

DELIVERABLES (look for quantity/type columns):
- deliverables: Array of {type, quantity, platform} for each deliverable
  - Types: post, story, reel, video, ugc, tweet, live, review

RIGHTS & EXCLUSIVITY:
- usageRights: organic_only, paid_usage, perpetual, 1_year, 6_months, etc.
- exclusivity: none, category_exclusive, full_exclusive, or specific terms

TIMELINE:
- startDate: Contract/campaign start (YYYY-MM-DD if possible)
- endDate: Contract/campaign end
- status: draft, pending, active, completed, cancelled

IMPORTANT RULES:
1. SOW tabs often have different structure than campaign trackers - adapt accordingly
2. If you see separate columns for different deliverable types (e.g., "IG Posts", "TikTok Videos"), combine into deliverables array
3. Look for total/aggregate values vs per-deliverable values
4. Preserve exact deal value strings (don't convert currencies)
5. If a column doesn't exist, omit that field
6. Skip summary rows, totals, or headers
7. Return [] if this doesn't appear to be SOW/contract data

Return a JSON array:
[
  {
    "influencerName": "Creator Name",
    "campaignName": "Campaign Name",
    "platform": "Instagram",
    "contractType": "flat_fee",
    "dealValue": "$5,000",
    "deliverables": [
      {"type": "reel", "quantity": 2, "platform": "Instagram"},
      {"type": "story", "quantity": 4, "platform": "Instagram"}
    ],
    "paymentTerms": "net_30",
    "usageRights": "1_year_paid",
    "exclusivity": "none",
    "startDate": "2024-03-01",
    "endDate": "2024-04-15",
    "status": "active"
  }
]

If no SOW/contract data found, return: []`

  console.log(`[SOW Extract] Tab: "${tabName}" batch ${batchIndex + 1} | Batch rows: ${batchRows.length}`)

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`❌ SOW tab "${tabName}" batch ${batchIndex + 1} did not return an array, skipping`)
      return []
    }

    if (parsed.length === 0) {
      console.log(`⚠️  SOW tab "${tabName}" batch ${batchIndex + 1}: AI returned 0 records`)
    } else {
      console.log(`✅ SOW tab "${tabName}" batch ${batchIndex + 1}: Extracted ${parsed.length} SOW records`)
    }

    // Map back with rawData — match by influencer name for accuracy
    const mapped = parsed.map((record: any, index: number) => {
      let rawRow = batchRows[index]
      if (record.influencerName) {
        const nameMatch = batchRows.find(r => {
          const vals = Object.values(r)
          return vals.some(v => v && String(v).toLowerCase().trim() === record.influencerName.toLowerCase().trim())
        })
        if (nameMatch) rawRow = nameMatch
      }

      return {
        influencerName: record.influencerName || undefined,
        campaignName: record.campaignName || undefined,
        platform: record.platform || undefined,
        contractType: record.contractType || undefined,
        dealValue: record.dealValue || undefined,
        deliverables: record.deliverables || undefined,
        paymentTerms: record.paymentTerms || undefined,
        usageRights: record.usageRights || undefined,
        exclusivity: record.exclusivity || undefined,
        startDate: record.startDate || undefined,
        endDate: record.endDate || undefined,
        status: record.status || undefined,
        rawData: rawRow || undefined,
      }
    })

    // Filter out internal team members
    const filtered = mapped.filter(record => {
      if (isInternalTeamMember(record.influencerName)) {
        console.log(`⏭️  Filtered out internal team member from SOW: ${record.influencerName}`)
        return false
      }
      return true
    })

    if (filtered.length < mapped.length) {
      console.log(`   Filtered ${mapped.length - filtered.length} internal team members from SOW`)
    }

    return filtered
  } catch (error) {
    console.error(`Failed to extract SOW records from tab "${tabName}" batch ${batchIndex + 1}:`, error)
    return []
  }
}

// Extract SOW records from spreadsheet tab data using AI
// Processes rows in batches to avoid token limit truncation
export async function extractSOWRecords(
  brandName: string,
  tabName: string,
  headers: string[],
  rows: Record<string, string | number>[],
  year?: number,
  platformFromTab?: string
): Promise<ExtractedSOWRecord[]> {
  if (rows.length === 0 || headers.length === 0) {
    return []
  }

  console.log(`[SOW Extract] Tab: "${tabName}" | ${rows.length} total rows | processing in batches of ${EXTRACTION_BATCH_SIZE}`)

  const allRecords: ExtractedSOWRecord[] = []

  for (let i = 0; i < rows.length; i += EXTRACTION_BATCH_SIZE) {
    const batchRows = rows.slice(i, i + EXTRACTION_BATCH_SIZE)
    const batchIndex = Math.floor(i / EXTRACTION_BATCH_SIZE)

    const batchRecords = await extractSOWBatch(
      brandName,
      tabName,
      headers,
      batchRows,
      batchIndex,
      rows.length,
      year,
      platformFromTab
    )

    allRecords.push(...batchRecords)
  }

  console.log(`[SOW Extract] Tab "${tabName}" total: ${allRecords.length} records from ${rows.length} rows`)
  return allRecords
}

// Build/update the influencer roster for a brand from SOW Review tab data
export async function buildInfluencerRoster(
  brandId: string,
  prisma: PrismaClient
): Promise<number> {
  // Get all tracker tabs for this brand that are "SOW Review" tabs
  const trackers = await prisma.campaignTracker.findMany({
    where: { brandId },
    include: {
      tabs: true,
    },
  })

  // Find SOW Review tabs (source of influencer data)
  const sowReviewTabs = trackers.flatMap(t =>
    t.tabs.filter(tab => tab.tabName.toLowerCase().includes('sow review'))
  )

  console.log(`📋 Found ${sowReviewTabs.length} SOW Review tab(s) for influencer extraction`)

  // Column name variations for each field
  const COLUMN_PATTERNS = {
    name: ['influencer', 'creator', 'name', 'talent', 'partner'],
    platform: ['platform', 'channel', 'social'],
    deliverables: ['deliverables', 'deliverable', 'content', 'assets'],
    term: ['term', 'contract term', 'duration', 'length', 'period'],
    paidUsageTerms: ['paid usage', 'usage terms', 'usage rights', 'paid usage terms', 'usage'],
    rate: ['rate', 'fee', 'cost', 'price', 'budget', 'value', 'total'],
    cohort: ['cohort', 'vertical', 'niche', 'category', 'segment', 'genre'],
    engagementRate: ['engagement rate', 'engagement', 'eng rate', 'eng%', 'er%', 'avg er', 'avg engagement'],
    followerCount: ['followers', 'follower count', 'audience size', 'audience', 'reach', 'subscribers', 'following'],
  }

  // Find column index by checking patterns
  function findColumnIndex(headers: string[], patterns: string[]): number {
    const normalizedHeaders = headers.map(h => h.toLowerCase().trim())
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (patterns.some(p => normalizedHeaders[i].includes(p))) {
        return i
      }
    }
    return -1
  }

  // Group influencers by name
  const influencerMap = new Map<
    string,
    {
      name: string
      platforms: Set<string>
      deliverables: string | null
      term: string | null
      paidUsageTerms: string | null
      dealValues: string[]
      count: number
      cohort: string | null
      engagementRate: string | null
      followerCount: string | null
    }
  >()

  for (const tab of sowReviewTabs) {
    if (!tab.rawData || !tab.headers) continue

    const headers = JSON.parse(tab.headers) as string[]
    const rows = JSON.parse(tab.rawData) as Record<string, string>[]

    // Find column indices
    const nameIdx = findColumnIndex(headers, COLUMN_PATTERNS.name)
    const platformIdx = findColumnIndex(headers, COLUMN_PATTERNS.platform)
    const deliverablesIdx = findColumnIndex(headers, COLUMN_PATTERNS.deliverables)
    const termIdx = findColumnIndex(headers, COLUMN_PATTERNS.term)
    const paidUsageIdx = findColumnIndex(headers, COLUMN_PATTERNS.paidUsageTerms)
    const rateIdx = findColumnIndex(headers, COLUMN_PATTERNS.rate)
    const cohortIdx = findColumnIndex(headers, COLUMN_PATTERNS.cohort)
    const engagementIdx = findColumnIndex(headers, COLUMN_PATTERNS.engagementRate)
    const followerIdx = findColumnIndex(headers, COLUMN_PATTERNS.followerCount)

    console.log(`  📊 Column mapping for ${tab.tabName}:`)
    console.log(`     Name: ${nameIdx >= 0 ? headers[nameIdx] : 'NOT FOUND'}`)
    console.log(`     Platform: ${platformIdx >= 0 ? headers[platformIdx] : 'NOT FOUND'}`)
    console.log(`     Deliverables: ${deliverablesIdx >= 0 ? headers[deliverablesIdx] : 'NOT FOUND'}`)
    console.log(`     Term: ${termIdx >= 0 ? headers[termIdx] : 'NOT FOUND'}`)
    console.log(`     Paid Usage: ${paidUsageIdx >= 0 ? headers[paidUsageIdx] : 'NOT FOUND'}`)
    console.log(`     Cohort: ${cohortIdx >= 0 ? headers[cohortIdx] : 'NOT FOUND'}`)
    console.log(`     Engagement: ${engagementIdx >= 0 ? headers[engagementIdx] : 'NOT FOUND'}`)
    console.log(`     Followers: ${followerIdx >= 0 ? headers[followerIdx] : 'NOT FOUND'}`)

    if (nameIdx < 0) {
      console.log(`  ⚠️  No influencer name column found in ${tab.tabName}, skipping`)
      continue
    }

    for (const row of rows) {
      const rowValues = Object.values(row)
      const name = rowValues[nameIdx]?.toString().trim()

      if (!name) continue

      // Skip internal team members
      if (isInternalTeamMember(name)) {
        console.log(`  ⏭️  Skipping internal team member: ${name}`)
        continue
      }

      const key = name.toLowerCase()

      if (!influencerMap.has(key)) {
        influencerMap.set(key, {
          name,
          platforms: new Set(),
          deliverables: null,
          term: null,
          paidUsageTerms: null,
          dealValues: [],
          count: 0,
          cohort: null,
          engagementRate: null,
          followerCount: null,
        })
      }

      const inf = influencerMap.get(key)!
      inf.count++

      // Extract fields
      if (platformIdx >= 0 && rowValues[platformIdx]) {
        inf.platforms.add(rowValues[platformIdx].toString().trim())
      }

      if (deliverablesIdx >= 0 && rowValues[deliverablesIdx] && !inf.deliverables) {
        inf.deliverables = rowValues[deliverablesIdx].toString().trim()
      }

      if (termIdx >= 0 && rowValues[termIdx] && !inf.term) {
        inf.term = rowValues[termIdx].toString().trim()
      }

      if (paidUsageIdx >= 0 && rowValues[paidUsageIdx] && !inf.paidUsageTerms) {
        inf.paidUsageTerms = rowValues[paidUsageIdx].toString().trim()
      }

      if (rateIdx >= 0 && rowValues[rateIdx]) {
        inf.dealValues.push(rowValues[rateIdx].toString().trim())
      }

      if (cohortIdx >= 0 && rowValues[cohortIdx] && !inf.cohort) {
        inf.cohort = rowValues[cohortIdx].toString().trim()
      }

      if (engagementIdx >= 0 && rowValues[engagementIdx] && !inf.engagementRate) {
        inf.engagementRate = rowValues[engagementIdx].toString().trim()
      }

      if (followerIdx >= 0 && rowValues[followerIdx] && !inf.followerCount) {
        inf.followerCount = rowValues[followerIdx].toString().trim()
      }
    }
  }

  console.log(`  👥 Found ${influencerMap.size} unique influencers from SOW Review tabs`)

  // Upsert each influencer
  for (const data of Array.from(influencerMap.values())) {
    // Estimate rate from deal values
    const estimatedRate = estimateRateRange(data.dealValues)

    // Determine primary platform (combine multiple if present)
    const platforms = Array.from(data.platforms)
    const primaryPlatform = platforms.length > 0 ? platforms.join(' + ') : null

    await prisma.brandInfluencer.upsert({
      where: {
        brandId_name: { brandId, name: data.name },
      },
      create: {
        brandId,
        name: data.name,
        platform: primaryPlatform,
        totalCampaigns: data.count,
        estimatedRate,
        deliverables: data.deliverables,
        term: data.term,
        paidUsageTerms: data.paidUsageTerms,
        cohort: data.cohort,
        engagementRate: data.engagementRate,
        followerCount: data.followerCount,
      },
      update: {
        platform: primaryPlatform,
        totalCampaigns: data.count,
        estimatedRate,
        deliverables: data.deliverables,
        term: data.term,
        paidUsageTerms: data.paidUsageTerms,
        cohort: data.cohort,
        engagementRate: data.engagementRate,
        followerCount: data.followerCount,
      },
    })
  }

  return influencerMap.size
}

// Estimate a rate range from deal values
function estimateRateRange(dealValues: string[]): string | null {
  if (dealValues.length === 0) return null

  // Extract numeric values
  const numbers: number[] = []
  for (const val of dealValues) {
    // Remove currency symbols and parse
    const match = val.match(/[\d,]+\.?\d*/g)
    if (match) {
      for (const numStr of match) {
        const num = parseFloat(numStr.replace(/,/g, ''))
        if (!isNaN(num) && num > 0) {
          numbers.push(num)
        }
      }
    }
  }

  if (numbers.length === 0) return null

  const min = Math.min(...numbers)
  const max = Math.max(...numbers)

  // Format as currency
  const formatCurrency = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`

  if (min === max) {
    return formatCurrency(min)
  }

  return `${formatCurrency(min)} - ${formatCurrency(max)}`
}

// Generate brand intelligence summary from all campaign data
export async function generateBrandIntelligence(
  brandId: string,
  prisma: PrismaClient
): Promise<void> {
  // Get brand with all related data
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      brandInfluencers: {
        orderBy: { totalCampaigns: 'desc' },
        take: 20,
      },
      campaignRecords: true,
      campaignTrackers: {
        select: { year: true, label: true },
      },
    },
  })

  if (!brand) return

  // Calculate aggregates
  const totalCampaigns = brand.campaignRecords.length
  const totalInfluencers = brand.brandInfluencers.length

  if (totalCampaigns === 0) {
    // No data to analyze
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        brandIntelligence: JSON.stringify({
          summary: 'No campaign data available yet. Sync your campaign trackers to generate insights.',
          totalCampaigns: 0,
          activeInfluencerCount: 0,
          yearsOfData: [],
          primaryPlatforms: [],
          typicalBudgetRange: 'Unknown',
          keyInsights: [],
        }),
      },
    })
    return
  }

  // Calculate platform breakdown
  const platformCounts = new Map<string, number>()
  const contentTypeCounts = new Map<string, number>()
  const statusCounts = new Map<string, number>()
  const dealValues: number[] = []
  const years = new Set<number>()

  for (const record of brand.campaignRecords) {
    if (record.platform) {
      platformCounts.set(
        record.platform,
        (platformCounts.get(record.platform) || 0) + 1
      )
    }
    if (record.contentType) {
      contentTypeCounts.set(
        record.contentType,
        (contentTypeCounts.get(record.contentType) || 0) + 1
      )
    }
    if (record.status) {
      statusCounts.set(record.status, (statusCounts.get(record.status) || 0) + 1)
    }
    if (record.year) {
      years.add(record.year)
    }
    if (record.dealValue) {
      const match = record.dealValue.match(/[\d,]+\.?\d*/g)
      if (match) {
        for (const numStr of match) {
          const num = parseFloat(numStr.replace(/,/g, ''))
          if (!isNaN(num) && num > 0) {
            dealValues.push(num)
          }
        }
      }
    }
  }

  // Sort platforms by count
  const sortedPlatforms = Array.from(platformCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)

  // Sort content types by count
  const sortedContentTypes = Array.from(contentTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ct]) => ct)

  // Calculate budget range
  let typicalBudgetRange = 'Unknown'
  if (dealValues.length > 0) {
    const sorted = dealValues.sort((a, b) => a - b)
    // Use 10th and 90th percentile for "typical" range
    const p10 = sorted[Math.floor(sorted.length * 0.1)]
    const p90 = sorted[Math.floor(sorted.length * 0.9)]
    const formatCurrency = (n: number) =>
      n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`
    typicalBudgetRange = `${formatCurrency(p10)} - ${formatCurrency(p90)}`
  }

  // Generate summary using AI
  const systemPrompt = `You are a marketing analyst generating brief, insightful summaries about brands' influencer marketing activities.
Respond with ONLY valid JSON.`

  const userPrompt = `Generate a brand intelligence summary for "${brand.name}".

Data:
- Total campaigns: ${totalCampaigns}
- Total influencers worked with: ${totalInfluencers}
- Years of data: ${Array.from(years).sort().join(', ') || 'Unknown'}
- Primary platforms: ${sortedPlatforms.slice(0, 3).join(', ') || 'Unknown'}
- Content types: ${sortedContentTypes.slice(0, 5).join(', ') || 'Unknown'}
- Typical budget range: ${typicalBudgetRange}

Top influencers by campaign count:
${brand.brandInfluencers.slice(0, 5).map((i) => `- ${i.name}: ${i.totalCampaigns} campaigns`).join('\n')}

Generate a JSON object with:
{
  "summary": "2-3 sentence narrative about this brand's influencer marketing approach and activity",
  "keyInsights": ["Insight 1", "Insight 2", "Insight 3"] // 3 specific, actionable insights about their campaigns
}`

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt, 1000)
    const parsed = parseJSONResponse(response)

    const intelligence = {
      summary: parsed?.summary || `${brand.name} has worked with ${totalInfluencers} influencers across ${totalCampaigns} campaigns.`,
      totalCampaigns,
      activeInfluencerCount: totalInfluencers,
      yearsOfData: Array.from(years).sort(),
      primaryPlatforms: sortedPlatforms.slice(0, 5),
      contentTypes: sortedContentTypes.slice(0, 5),
      typicalBudgetRange,
      keyInsights: parsed?.keyInsights || [],
      platformBreakdown: Object.fromEntries(platformCounts),
      statusBreakdown: Object.fromEntries(statusCounts),
      generatedAt: new Date().toISOString(),
    }

    await prisma.brand.update({
      where: { id: brandId },
      data: {
        brandIntelligence: JSON.stringify(intelligence),
      },
    })
  } catch (error) {
    console.error('Failed to generate brand intelligence:', error)

    // Store basic intelligence without AI summary
    const intelligence = {
      summary: `${brand.name} has worked with ${totalInfluencers} influencers across ${totalCampaigns} campaigns.`,
      totalCampaigns,
      activeInfluencerCount: totalInfluencers,
      yearsOfData: Array.from(years).sort(),
      primaryPlatforms: sortedPlatforms.slice(0, 5),
      contentTypes: sortedContentTypes.slice(0, 5),
      typicalBudgetRange,
      keyInsights: [],
      platformBreakdown: Object.fromEntries(platformCounts),
      statusBreakdown: Object.fromEntries(statusCounts),
      generatedAt: new Date().toISOString(),
    }

    await prisma.brand.update({
      where: { id: brandId },
      data: {
        brandIntelligence: JSON.stringify(intelligence),
      },
    })
  }
}
