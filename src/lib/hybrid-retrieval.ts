// Hybrid RAG Architecture: Structured Queries + Semantic Retrieval
// Route questions to appropriate retrieval strategy, never rely on one giant prompt

import { PrismaClient } from '@prisma/client'
import { getCheapStructuredCompletion, parseJSONResponse } from './ai'

export type QueryType = 
  | 'factual_count'        // "How many campaigns...?"
  | 'factual_specific'     // "What was the deal value for X?"
  | 'factual_list'         // "Which influencers...?"
  | 'factual_aggregate'    // "Total spend on...?"
  | 'comparative'          // "Compare X vs Y"
  | 'trend'                // "How has X changed over time?"
  | 'strategic'            // "Should we...?" "What do you recommend?"
  | 'qualitative'          // "What challenges did we face?"
  | 'exploratory'          // Vague or multi-part questions

export interface ClassifiedQuery {
  type: QueryType
  confidence: number
  entities: {
    brandName?: string
    influencerName?: string
    platform?: string
    year?: number
    quarter?: string
    campaignName?: string
  }
  intent: string
  requiresSemanticSearch: boolean
  requiresStructuredQuery: boolean
}

export interface RetrievalResult {
  queryType: QueryType
  structuredData?: any        // Direct database results
  semanticResults?: any[]     // Semantic search results (insights, similar situations)
  dataQualityWarnings?: string[]
  confidence: number
  sources: Array<{
    type: 'database' | 'insight' | 'trend' | 'recommendation'
    recordId?: string
    confidence?: number
  }>
}

// Step 1: Classify the user's question
export async function classifyQuery(
  question: string,
  brandContext: { brandId: string; brandName: string }
): Promise<ClassifiedQuery> {
  const systemPrompt = `You are a query classification expert for campaign intelligence systems.
Analyze user questions and classify them for optimal retrieval strategy.
Respond with ONLY valid JSON.`

  const userPrompt = `Classify this question from a user asking about "${brandContext.brandName}" campaign data:

"${question}"

QUERY TYPES:
- factual_count: Counting questions (how many, count of)
- factual_specific: Specific fact lookup (what was X, when did Y)
- factual_list: List generation (which influencers, list all)
- factual_aggregate: Aggregations (total, average, sum)
- comparative: Comparing entities (X vs Y, better/worse)
- trend: Change over time (growth, increase, trend)
- strategic: Recommendations, advice, "should we"
- qualitative: Asking about experiences, challenges, learnings
- exploratory: Vague, broad, or multi-part questions

EXTRACTION:
- Identify specific entities: influencer names, platforms, years, campaigns
- Determine if structured DB queries are needed
- Determine if semantic search of insights is needed

Return JSON:
{
  "type": "factual_count",
  "confidence": 0.95,
  "entities": {
    "platform": "Instagram",
    "year": 2024
  },
  "intent": "Count Instagram campaigns in 2024",
  "requiresSemanticSearch": false,
  "requiresStructuredQuery": true
}`

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt, 1000)
    const parsed = parseJSONResponse(response)

    return {
      type: parsed.type || 'exploratory',
      confidence: parsed.confidence || 0.5,
      entities: parsed.entities || {},
      intent: parsed.intent || question,
      requiresSemanticSearch: parsed.requiresSemanticSearch || false,
      requiresStructuredQuery: parsed.requiresStructuredQuery || true,
    }
  } catch (error) {
    console.error('Query classification failed:', error)
    return {
      type: 'exploratory',
      confidence: 0.3,
      entities: {},
      intent: question,
      requiresSemanticSearch: true,
      requiresStructuredQuery: true,
    }
  }
}

// Step 2: Execute structured database queries
export async function executeStructuredQuery(
  classification: ClassifiedQuery,
  brandId: string,
  prisma: PrismaClient
): Promise<any> {
  const { type, entities } = classification

  switch (type) {
    case 'factual_count':
      return await executeCountQuery(brandId, entities, prisma)
    
    case 'factual_list':
      return await executeListQuery(brandId, entities, prisma)
    
    case 'factual_aggregate':
      return await executeAggregateQuery(brandId, entities, prisma)
    
    case 'comparative':
      return await executeComparativeQuery(brandId, entities, prisma)
    
    case 'trend':
      return await executeTrendQuery(brandId, entities, prisma)
    
    default:
      return null
  }
}

// Count queries: "How many campaigns did we run with X?"
async function executeCountQuery(
  brandId: string,
  entities: ClassifiedQuery['entities'],
  prisma: PrismaClient
) {
  const where: any = { brandId }
  if (entities.influencerName) where.influencerName = { contains: entities.influencerName }
  if (entities.platform) where.platform = entities.platform
  if (entities.year) where.year = entities.year
  if (entities.campaignName) where.campaignName = { contains: entities.campaignName }

  const count = await prisma.campaignRecord.count({ where })
  
  const breakdown = await prisma.campaignRecord.groupBy({
    by: ['platform', 'year'],
    where,
    _count: true,
  })

  return {
    totalCount: count,
    breakdown,
    filters: entities,
  }
}

// List queries: "Which influencers have we worked with?"
async function executeListQuery(
  brandId: string,
  entities: ClassifiedQuery['entities'],
  prisma: PrismaClient
) {
  const where: any = { brandId }
  if (entities.platform) where.platform = entities.platform

  // If filtering by year, need to check campaign records
  if (entities.year) {
    const influencers = await prisma.brandInfluencer.findMany({
      where: {
        brandId,
      },
      orderBy: { totalCampaigns: 'desc' },
      take: 50,
      include: {
        influencerNotes: {
          take: 3,
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    // Filter by year through campaign records
    const filtered = []
    for (const inf of influencers) {
      const campaigns = await prisma.campaignRecord.findFirst({
        where: {
          brandId,
          influencerName: { contains: inf.name },
          year: entities.year,
        },
      })
      if (campaigns) filtered.push(inf)
    }

    return { influencers: filtered, filters: entities }
  }

  const influencers = await prisma.brandInfluencer.findMany({
    where,
    orderBy: { totalCampaigns: 'desc' },
    take: 50,
    include: {
      influencerNotes: {
        take: 3,
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  return { influencers, filters: entities }
}

// Aggregate queries: "What's our total spend on Instagram?"
async function executeAggregateQuery(
  brandId: string,
  entities: ClassifiedQuery['entities'],
  prisma: PrismaClient
) {
  const where: any = { brandId, totalValue: { not: null } }
  if (entities.platform) where.platform = entities.platform
  if (entities.year) where.year = entities.year

  const records = await prisma.campaignRecord.findMany({
    where,
    select: { totalValue: true, dealValue: true, platform: true, year: true, influencerName: true },
  })

  const totalCents = records.reduce((sum, r) => sum + (r.totalValue || 0), 0)
  const totalDollars = totalCents / 100

  const byPlatform = records.reduce((acc, r) => {
    if (!r.platform) return acc
    acc[r.platform] = (acc[r.platform] || 0) + (r.totalValue || 0)
    return acc
  }, {} as Record<string, number>)

  return {
    totalSpend: totalDollars,
    totalSpendFormatted: `$${totalDollars.toLocaleString()}`,
    recordCount: records.length,
    byPlatform: Object.entries(byPlatform).map(([platform, cents]) => ({
      platform,
      spend: cents / 100,
      spendFormatted: `$${(cents / 100).toLocaleString()}`,
    })),
    filters: entities,
  }
}

// Comparative queries: "Compare Instagram vs TikTok performance"
async function executeComparativeQuery(
  brandId: string,
  entities: ClassifiedQuery['entities'],
  prisma: PrismaClient
) {
  const allRecords = await prisma.campaignRecord.findMany({
    where: { brandId, year: entities.year || undefined },
    select: { 
      platform: true, 
      dealValue: true, 
      totalValue: true,
      status: true, 
      influencerName: true,
      campaignName: true,
      year: true,
      contentType: true,
    },
  })

  // Group by platform
  const platformStats = new Map<string, any>()
  for (const record of allRecords) {
    if (!record.platform) continue
    
    if (!platformStats.has(record.platform)) {
      platformStats.set(record.platform, {
        platform: record.platform,
        campaigns: 0,
        totalSpend: 0,
        influencers: new Set(),
        contentTypes: new Map(),
      })
    }
    
    const stats = platformStats.get(record.platform)!
    stats.campaigns++
    if (record.totalValue) stats.totalSpend += record.totalValue
    if (record.influencerName) stats.influencers.add(record.influencerName)
    if (record.contentType) {
      stats.contentTypes.set(
        record.contentType,
        (stats.contentTypes.get(record.contentType) || 0) + 1
      )
    }
  }

  const comparison = Array.from(platformStats.values()).map(stats => ({
    platform: stats.platform,
    campaigns: stats.campaigns,
    totalSpend: stats.totalSpend / 100,
    totalSpendFormatted: `$${(stats.totalSpend / 100).toLocaleString()}`,
    uniqueInfluencers: stats.influencers.size,
    topContentTypes: Array.from(stats.contentTypes.entries() as Iterable<[string, number]>)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]: [string, number]) => ({ type, count })),
  }))

  return {
    comparison,
    comparisonType: 'platform',
    entities,
  }
}

// Trend queries: "How has our Instagram spending changed?"
async function executeTrendQuery(
  brandId: string,
  entities: ClassifiedQuery['entities'],
  prisma: PrismaClient
) {
  // Check if we have pre-computed trends
  const existingTrends = await prisma.trendAnalysis.findMany({
    where: {
      brandId,
      status: 'active',
    },
    orderBy: { detectedAt: 'desc' },
    take: 10,
  })

  // Also get raw data for trend calculation
  const records = await prisma.campaignRecord.findMany({
    where: {
      brandId,
      platform: entities.platform || undefined,
    },
    select: { year: true, quarter: true, dealValue: true, totalValue: true, platform: true },
    orderBy: { year: 'asc' },
  })

  // Calculate year-over-year trends
  const yearlyData = new Map<number, { campaigns: number; spend: number }>()
  for (const record of records) {
    if (!record.year) continue
    if (!yearlyData.has(record.year)) {
      yearlyData.set(record.year, { campaigns: 0, spend: 0 })
    }
    const data = yearlyData.get(record.year)!
    data.campaigns++
    if (record.totalValue) data.spend += record.totalValue
  }

  const yearlyTrend = Array.from(yearlyData.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, data]) => ({
      year,
      campaigns: data.campaigns,
      spend: data.spend / 100,
      spendFormatted: `$${(data.spend / 100).toLocaleString()}`,
    }))

  return {
    existingTrends,
    yearlyTrend,
    entities,
  }
}

// Step 3: Execute semantic search (for qualitative insights)
export async function executeSemanticSearch(
  classification: ClassifiedQuery,
  brandId: string,
  prisma: PrismaClient
): Promise<any[]> {
  // For now, use keyword matching on insights
  // Future: Replace with vector similarity search

  const keywords = extractKeywords(classification.intent)

  // Build OR conditions dynamically, only including defined values
  const orConditions: any[] = []

  if (keywords[0]) {
    orConditions.push({ description: { contains: keywords[0] } })
    orConditions.push({ title: { contains: keywords[0] } })
  }

  if (classification.entities.influencerName) {
    orConditions.push({
      influencerName: { contains: classification.entities.influencerName }
    })
  }

  if (classification.entities.platform) {
    orConditions.push({ platform: classification.entities.platform })
  }

  // If no conditions, return empty array
  if (orConditions.length === 0) {
    return []
  }

  const insights = await prisma.campaignInsight.findMany({
    where: {
      brandId,
      OR: orConditions,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return insights
}

// Step 4: Combine results into unified retrieval
export async function hybridRetrieve(
  question: string,
  brandContext: { brandId: string; brandName: string },
  prisma: PrismaClient
): Promise<RetrievalResult> {
  // Classify the query
  const classification = await classifyQuery(question, brandContext)
  
  let structuredData = null
  let semanticResults: any[] = []
  let dataQualityWarnings: string[] = []

  // Execute structured queries if needed
  if (classification.requiresStructuredQuery) {
    structuredData = await executeStructuredQuery(
      classification,
      brandContext.brandId,
      prisma
    )
  }

  // Execute semantic search if needed
  if (classification.requiresSemanticSearch) {
    semanticResults = await executeSemanticSearch(
      classification,
      brandContext.brandId,
      prisma
    )
  }

  // Check for data quality warnings
  const qualityFlags = await prisma.dataQualityFlag.findMany({
    where: {
      brandId: brandContext.brandId,
      status: 'open',
      severity: { in: ['high', 'medium'] },
    },
    take: 3,
  })
  dataQualityWarnings = qualityFlags.map(f => f.description)

  return {
    queryType: classification.type,
    structuredData,
    semanticResults,
    dataQualityWarnings,
    confidence: classification.confidence,
    sources: [
      ...(structuredData ? [{ type: 'database' as const }] : []),
      ...semanticResults.map(s => ({ 
        type: 'insight' as const, 
        recordId: s.id,
      })),
    ],
  }
}

// Helper: Extract keywords from question
function extractKeywords(text: string): string[] {
  const stopWords = ['the', 'is', 'at', 'which', 'on', 'what', 'how', 'when', 'where', 'who', 'did', 'we', 'have', 'has', 'was', 'were', 'are', 'been', 'be', 'do', 'does']
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.includes(word))
    .slice(0, 5)
}
