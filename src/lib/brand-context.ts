// Brand Context Retrieval
// Provides rich context about brands, influencers, and campaigns for AI Q&A

import { PrismaClient } from '@prisma/client'
import { prisma } from './db'

// Brand context type for AI consumption
export interface BrandContext {
  brandId: string
  brandName: string
  summary: string
  insights: string[]
  platforms: string[]
  budgetRange: string
  totalCampaigns: number
  totalInfluencers: number
  yearsOfData: number[]
  influencers: Array<{
    name: string
    email: string | null
    platform: string | null
    campaigns: number
    rate: string | null
  }>
  recentCampaigns: Array<{
    influencer: string | null
    campaign: string | null
    platform: string | null
    dealValue: string | null
    status: string | null
    year: number | null
  }>
  sowDeals: Array<{
    influencer: string | null
    campaign: string | null
    platform: string | null
    dealValue: string | null
    contractType: string | null
    deliverables: any
    paymentTerms: string | null
    usageRights: string | null
    exclusivity: string | null
    status: string | null
  }>
  trackers: Array<{
    label: string | null
    year: number | null
    status: string
  }>
  campaignInsights: Array<{
    category: string
    sentiment: string
    title: string
    description: string
    confidence: string
  }>
  trends: Array<{
    trendType: string
    title: string
    description: string
    magnitude: number | null
    timeframe: string
  }>
  recommendations: Array<{
    category: string
    priority: string
    title: string
    recommendation: string
    rationale: string
  }>
  dataQualityIssues: number
}

// Get comprehensive context for a specific brand
export async function getBrandContext(
  brandId: string,
  options: {
    includeInfluencers?: boolean
    influencerLimit?: number
    includeCampaigns?: boolean
    campaignLimit?: number
    includeSOW?: boolean
    sowLimit?: number
  } = {}
): Promise<BrandContext | null> {
  const {
    includeInfluencers = true,
    influencerLimit = 20,
    includeCampaigns = true,
    campaignLimit = 50,
    includeSOW = true,
    sowLimit = 30,
  } = options

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      brandInfluencers: includeInfluencers
        ? {
            orderBy: { totalCampaigns: 'desc' },
            take: influencerLimit,
          }
        : false,
      campaignRecords: includeCampaigns
        ? {
            where: { recordType: 'campaign' },
            orderBy: { createdAt: 'desc' },
            take: campaignLimit,
          }
        : false,
      campaignTrackers: {
        select: { label: true, year: true, syncStatus: true },
      },
      campaignInsights: {
        where: { confidence: { in: ['medium', 'high'] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      trendAnalyses: {
        where: { status: 'active' },
        orderBy: { detectedAt: 'desc' },
        take: 10,
      },
      strategicRecommendations: {
        where: { status: 'pending' },
        orderBy: { priority: 'desc' },
        take: 10,
      },
      dataQualityFlags: {
        where: { status: 'open' },
      },
    },
  })

  if (!brand) return null

  // Fetch SOW records separately
  let sowRecords: any[] = []
  if (includeSOW) {
    sowRecords = await prisma.campaignRecord.findMany({
      where: { brandId, recordType: 'sow' },
      orderBy: { createdAt: 'desc' },
      take: sowLimit,
    })
  }

  // Parse brand intelligence
  let intelligence: any = {}
  if (brand.brandIntelligence) {
    try {
      intelligence = JSON.parse(brand.brandIntelligence)
    } catch {}
  }

  return {
    brandId: brand.id,
    brandName: brand.name,
    summary: intelligence.summary || 'No intelligence generated yet',
    insights: intelligence.keyInsights || [],
    platforms: intelligence.primaryPlatforms || [],
    budgetRange: intelligence.typicalBudgetRange || 'Unknown',
    totalCampaigns: intelligence.totalCampaigns || 0,
    totalInfluencers: intelligence.activeInfluencerCount || 0,
    yearsOfData: intelligence.yearsOfData || [],
    influencers: (brand.brandInfluencers || []).map((i) => ({
      name: i.name,
      email: i.email,
      platform: i.platform,
      campaigns: i.totalCampaigns,
      rate: i.estimatedRate,
    })),
    recentCampaigns: (brand.campaignRecords || []).map((c) => ({
      influencer: c.influencerName,
      campaign: c.campaignName,
      platform: c.platform,
      dealValue: c.dealValue,
      status: c.status,
      year: c.year,
    })),
    sowDeals: sowRecords.map((s) => ({
      influencer: s.influencerName,
      campaign: s.campaignName,
      platform: s.platform,
      dealValue: s.dealValue,
      contractType: s.contractType,
      deliverables: s.deliverables ? JSON.parse(s.deliverables) : null,
      paymentTerms: s.paymentTerms,
      usageRights: s.usageRights,
      exclusivity: s.exclusivity,
      status: s.status,
    })),
    trackers: brand.campaignTrackers.map((t) => ({
      label: t.label,
      year: t.year,
      status: t.syncStatus,
    })),
    campaignInsights: (brand.campaignInsights || []).map((i) => ({
      category: i.category,
      sentiment: i.sentiment,
      title: i.title,
      description: i.description,
      confidence: i.confidence,
    })),
    trends: (brand.trendAnalyses || []).map((t) => ({
      trendType: t.trendType,
      title: t.title,
      description: t.description,
      magnitude: t.magnitude,
      timeframe: t.timeframe,
    })),
    recommendations: (brand.strategicRecommendations || []).map((r) => ({
      category: r.category,
      priority: r.priority,
      title: r.title,
      recommendation: r.recommendation,
      rationale: r.rationale,
    })),
    dataQualityIssues: brand.dataQualityFlags?.length || 0,
  }
}

// Search for influencers across all brands
export async function searchInfluencerContext(
  query: string,
  limit: number = 10
): Promise<
  Array<{
    name: string
    email: string | null
    platform: string | null
    brandName: string
    brandId: string
    campaigns: number
    rate: string | null
  }>
> {
  // Clean the query (remove @ if present)
  const cleanQuery = query.replace(/^@/, '').trim()

  const influencers = await prisma.brandInfluencer.findMany({
    where: {
      OR: [
        { name: { contains: cleanQuery } },
        { email: { contains: cleanQuery } },
      ],
    },
    include: {
      brand: { select: { id: true, name: true } },
    },
    take: limit,
    orderBy: { totalCampaigns: 'desc' },
  })

  return influencers.map((i) => ({
    name: i.name,
    email: i.email,
    platform: i.platform,
    brandName: i.brand.name,
    brandId: i.brand.id,
    campaigns: i.totalCampaigns,
    rate: i.estimatedRate,
  }))
}

// Search campaigns with filters
export async function searchCampaignContext(filters: {
  brandId?: string
  influencerName?: string
  platform?: string
  year?: number
  status?: string
  limit?: number
}): Promise<
  Array<{
    influencer: string | null
    campaign: string | null
    platform: string | null
    dealValue: string | null
    status: string | null
    year: number | null
    brandName: string
    brandId: string
  }>
> {
  const { limit = 30, ...where } = filters

  const campaigns = await prisma.campaignRecord.findMany({
    where: {
      ...(where.brandId && { brandId: where.brandId }),
      ...(where.influencerName && {
        influencerName: { contains: where.influencerName },
      }),
      ...(where.platform && { platform: where.platform }),
      ...(where.year && { year: where.year }),
      ...(where.status && { status: { contains: where.status } }),
    },
    include: {
      brand: { select: { id: true, name: true } },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  return campaigns.map((c) => ({
    influencer: c.influencerName,
    campaign: c.campaignName,
    platform: c.platform,
    dealValue: c.dealValue,
    status: c.status,
    year: c.year,
    brandName: c.brand.name,
    brandId: c.brand.id,
  }))
}

// Get all brands with their intelligence summaries for overview context
export async function getAllBrandsContext(): Promise<
  Array<{
    id: string
    name: string
    summary: string
    influencerCount: number
    campaignCount: number
    trackerCount: number
    platforms: string[]
  }>
> {
  const brands = await prisma.brand.findMany({
    select: {
      id: true,
      name: true,
      brandIntelligence: true,
      _count: {
        select: {
          brandInfluencers: true,
          campaignRecords: true,
          campaignTrackers: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  return brands.map((b) => {
    let intelligence: any = {}
    if (b.brandIntelligence) {
      try {
        intelligence = JSON.parse(b.brandIntelligence)
      } catch {}
    }

    return {
      id: b.id,
      name: b.name,
      summary: intelligence.summary || 'No intelligence yet',
      influencerCount: b._count.brandInfluencers,
      campaignCount: b._count.campaignRecords,
      trackerCount: b._count.campaignTrackers,
      platforms: intelligence.primaryPlatforms || [],
    }
  })
}

// Find brand by name (fuzzy match)
export async function findBrandByName(
  name: string
): Promise<{ id: string; name: string } | null> {
  const brand = await prisma.brand.findFirst({
    where: {
      name: { contains: name },
    },
    select: { id: true, name: true },
  })

  return brand
}

// Build a rich context string for AI consumption
export async function buildAIContext(options: {
  brandId?: string
  question?: string
}): Promise<string> {
  const parts: string[] = []

  // Get all brands overview
  const allBrands = await getAllBrandsContext()
  parts.push('=== BRANDS OVERVIEW ===')
  parts.push(`Total brands: ${allBrands.length}`)
  parts.push(
    allBrands
      .map(
        (b) =>
          `- ${b.name}: ${b.influencerCount} influencers, ${b.campaignCount} campaigns on ${b.platforms.join(', ') || 'unknown platforms'}`
      )
      .join('\n')
  )

  // If a specific brand is requested, add detailed context
  if (options.brandId) {
    const brandContext = await getBrandContext(options.brandId)
    if (brandContext) {
      parts.push('')
      parts.push(`=== DETAILED CONTEXT: ${brandContext.brandName} ===`)
      parts.push(`Summary: ${brandContext.summary}`)
      parts.push(`Budget Range: ${brandContext.budgetRange}`)
      parts.push(`Years of Data: ${brandContext.yearsOfData.join(', ') || 'Unknown'}`)
      parts.push(`Platforms: ${brandContext.platforms.join(', ') || 'Unknown'}`)

      if (brandContext.insights.length > 0) {
        parts.push(`Key Insights:`)
        brandContext.insights.forEach((i) => parts.push(`  - ${i}`))
      }

      parts.push('')
      parts.push(`Top Influencers (${brandContext.influencers.length} shown):`)
      brandContext.influencers.slice(0, 10).forEach((i) => {
        parts.push(
          `  - ${i.name} (${i.platform || 'Unknown'}): ${i.campaigns} campaigns, rate: ${i.rate || 'unknown'}`
        )
      })

      parts.push('')
      parts.push(`Recent Campaigns (${brandContext.recentCampaigns.length} shown):`)
      brandContext.recentCampaigns.slice(0, 10).forEach((c) => {
        parts.push(
          `  - ${c.influencer || 'Unknown'}: "${c.campaign || 'Unnamed'}" on ${c.platform || 'Unknown'} - ${c.dealValue || 'value unknown'} (${c.status || 'status unknown'})`
        )
      })

      // Add SOW/Contract deals section
      if (brandContext.sowDeals && brandContext.sowDeals.length > 0) {
        parts.push('')
        parts.push(`=== SOW/CONTRACT DEALS (${brandContext.sowDeals.length} shown) ===`)
        brandContext.sowDeals.slice(0, 15).forEach((s) => {
          const deliverablesSummary = s.deliverables
            ? (s.deliverables as Array<{ type: string; quantity: number }>)
                .map((d) => `${d.quantity}x ${d.type}`)
                .join(', ')
            : 'not specified'
          parts.push(
            `  - ${s.influencer || 'Unknown'}: ${s.dealValue || 'TBD'} for "${s.campaign || 'Unnamed'}" (${s.contractType || 'unknown type'})`
          )
          parts.push(`    Deliverables: ${deliverablesSummary}`)
          if (s.usageRights) parts.push(`    Usage Rights: ${s.usageRights}`)
          if (s.exclusivity && s.exclusivity !== 'none') parts.push(`    Exclusivity: ${s.exclusivity}`)
          if (s.paymentTerms) parts.push(`    Payment Terms: ${s.paymentTerms}`)
        })
      }

      // Add qualitative insights section
      if (brandContext.campaignInsights && brandContext.campaignInsights.length > 0) {
        parts.push('')
        parts.push(`=== CAMPAIGN INSIGHTS (${brandContext.campaignInsights.length} shown) ===`)
        brandContext.campaignInsights.slice(0, 10).forEach((insight) => {
          const emoji = insight.sentiment === 'positive' ? '✅' : insight.sentiment === 'negative' ? '⚠️' : 'ℹ️'
          parts.push(`  ${emoji} [${insight.category}] ${insight.title}`)
          parts.push(`    ${insight.description}`)
          parts.push(`    Confidence: ${insight.confidence}`)
        })
      }

      // Add trends section
      if (brandContext.trends && brandContext.trends.length > 0) {
        parts.push('')
        parts.push(`=== DETECTED TRENDS (${brandContext.trends.length} shown) ===`)
        brandContext.trends.forEach((trend) => {
          const arrow = trend.magnitude && trend.magnitude > 0 ? '📈' : trend.magnitude && trend.magnitude < 0 ? '📉' : '→'
          const mag = trend.magnitude ? ` (${trend.magnitude > 0 ? '+' : ''}${trend.magnitude.toFixed(1)}%)` : ''
          parts.push(`  ${arrow} ${trend.title}${mag}`)
          parts.push(`    ${trend.description}`)
          parts.push(`    Timeframe: ${trend.timeframe}`)
        })
      }

      // Add strategic recommendations section
      if (brandContext.recommendations && brandContext.recommendations.length > 0) {
        parts.push('')
        parts.push(`=== STRATEGIC RECOMMENDATIONS (${brandContext.recommendations.length} shown) ===`)
        brandContext.recommendations.forEach((rec) => {
          const priorityEmoji = rec.priority === 'high' || rec.priority === 'urgent' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢'
          parts.push(`  ${priorityEmoji} [${rec.priority}] ${rec.title}`)
          parts.push(`    Recommendation: ${rec.recommendation}`)
          parts.push(`    Rationale: ${rec.rationale}`)
        })
      }

      // Add data quality warning if issues exist
      if (brandContext.dataQualityIssues > 0) {
        parts.push('')
        parts.push(`⚠️  DATA QUALITY NOTICE: ${brandContext.dataQualityIssues} open data quality flags`)
        parts.push(`  Some data may be incomplete, uncertain, or require verification`)
      }
    }
  }

  // If the question mentions an influencer, search for them
  if (options.question) {
    const mentionedHandle = options.question.match(/@(\w+)/)?.[1]
    if (mentionedHandle) {
      const influencerResults = await searchInfluencerContext(mentionedHandle)
      if (influencerResults.length > 0) {
        parts.push('')
        parts.push(`=== INFLUENCER SEARCH: @${mentionedHandle} ===`)
        influencerResults.forEach((i) => {
          parts.push(
            `- ${i.name} (${i.email || 'no email'}) at ${i.brandName}: ${i.campaigns} campaigns, rate: ${i.rate || 'unknown'}`
          )
        })
      }
    }

    // Check for year mentions
    const yearMatch = options.question.match(/\b(202\d)\b/)
    if (yearMatch) {
      const year = parseInt(yearMatch[1], 10)
      const yearCampaigns = await searchCampaignContext({ year, limit: 20 })
      if (yearCampaigns.length > 0) {
        parts.push('')
        parts.push(`=== CAMPAIGNS FROM ${year} ===`)
        yearCampaigns.forEach((c) => {
          parts.push(
            `- ${c.influencer || 'Unknown'} for ${c.brandName}: "${c.campaign || 'Unnamed'}" on ${c.platform || 'Unknown'} - ${c.dealValue || 'value unknown'}`
          )
        })
      }
    }
  }

  return parts.join('\n')
}
