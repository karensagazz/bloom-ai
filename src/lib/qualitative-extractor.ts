// Qualitative Data Extractor
// Uses AI (Claude Sonnet) to extract insights, notes, and learnings from campaign tracker data

import { PrismaClient } from '@prisma/client'
import { getCheapStructuredCompletion, parseJSONResponse } from './ai'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ExtractedInsight {
  category: string        // performance, creative, audience, timing, budget
  sentiment: string       // positive, negative, neutral, mixed
  title: string
  description: string
  sourceType: string      // tracker_note, ai_detected
  confidence: string      // low, medium, high
  influencerName?: string
  campaignName?: string
  platform?: string
  year?: number
  quarter?: string
}

export interface ExtractedInfluencerNote {
  influencerName: string
  noteType: string        // performance, reliability, creative_quality, audience_fit, communication
  sentiment: string       // positive, negative, neutral
  content: string
  sourceType: string      // campaign_data, ai_extracted
  confidence: string      // low, medium, high
  year?: number
}

export interface ExtractedBrandLearning {
  category: string        // platform_strategy, budget_optimization, content_type, timing, audience
  priority: string        // low, medium, high, critical
  title: string
  description: string
  recommendation?: string
  confidence: string      // low, medium, high
  sampleSize?: number
  platforms?: string[]
  timeframe?: string
}

export interface ExtractedTrend {
  trendType: string       // growth, decline, seasonal, platform_shift, budget_change
  metric: string          // engagement, spend, influencer_count, etc.
  direction: string       // increasing, decreasing, stable, volatile
  title: string
  description: string
  magnitude?: number      // Percentage change
  confidence: string      // low, medium, high
  timeframe: string
  platforms?: string[]
  influencers?: string[]
}

// ============================================================================
// CAMPAIGN INSIGHTS EXTRACTION
// ============================================================================

export async function extractCampaignInsights(
  brandName: string,
  tabName: string,
  headers: string[],
  rows: Record<string, string | number>[],
  year?: number
): Promise<ExtractedInsight[]> {
  // Guard: Skip tabs with no data
  if (rows.length === 0 || headers.length === 0) {
    return []
  }

  // Sample rows to control token usage (max 50 rows)
  const sampleRows = rows.slice(0, 50)
  const hasMore = rows.length > 50

  const systemPrompt = `You are a marketing intelligence analyst that extracts qualitative insights from campaign tracker spreadsheets.
Your job is to identify notes, observations, and learnings that indicate performance, strategy, or outcomes.
You must respond with ONLY valid JSON - no explanations or markdown.`

  const userPrompt = `Analyze this campaign tracker tab for qualitative insights about "${brandName}".

Tab name: "${tabName}"
${year ? `Year: ${year}` : ''}

Column headers: ${JSON.stringify(headers)}

Data rows (${sampleRows.length} of ${rows.length} total${hasMore ? ' - showing sample' : ''}):
${JSON.stringify(sampleRows, null, 2)}

TASK: Extract qualitative insights from this data. Look for:
1. Performance observations (good/bad engagement, conversions, reach)
2. Creative insights (what content worked/didn't work)
3. Audience insights (who engaged, demographics mentioned)
4. Timing insights (seasonal patterns, best posting times)
5. Budget insights (ROI mentions, cost efficiency notes)

INSIGHT CATEGORIES:
- "performance": Engagement rates, conversions, reach, ROI observations
- "creative": Content style, format, messaging effectiveness
- "audience": Demographic insights, audience fit observations
- "timing": Seasonal patterns, posting schedule effectiveness
- "budget": Cost efficiency, budget allocation learnings

SENTIMENT:
- "positive": Good performance, successful outcome
- "negative": Poor performance, unsuccessful outcome
- "neutral": Observation without clear positive/negative
- "mixed": Both positive and negative aspects

CONFIDENCE LEVELS:
- "high": Explicit note or clear quantitative indicator
- "medium": Implied from data or partial information
- "low": Inference from indirect signals

IMPORTANT RULES:
1. Only extract insights that are PRESENT in the data (notes, comments, status indicators)
2. Look in columns like: "Notes", "Comments", "Learnings", "Performance", "Status", "Results"
3. If a row says "Performed well" or "Low engagement" - that's an insight
4. DO NOT invent insights - if there are no notes/observations, return []
5. Link insights to specific influencers/campaigns when possible
6. Assign confidence based on how explicit the insight is
7. Skip generic status updates like "Completed" unless there's performance context

EXAMPLES OF VALID INSIGHTS:
- Row has "Notes" column with "Great engagement, 15% conversion" → performance insight
- Row has "Status" = "Underperformed" → negative performance insight
- Row has "Comments" = "Summer content resonated well" → timing + creative insight

Return JSON array:
[
  {
    "category": "performance",
    "sentiment": "positive",
    "title": "High engagement on Instagram Reels",
    "description": "Influencer X's Reel campaign achieved 15% conversion rate, exceeding benchmark",
    "sourceType": "tracker_note",
    "confidence": "high",
    "influencerName": "Influencer X",
    "campaignName": "Summer Launch",
    "platform": "Instagram",
    "year": ${year || 'null'},
    "quarter": "Q2"
  }
]

If no insights found in the data, return: []`

  // LOG: What we're sending to AI
  console.log(`[Insight Extract] Tab: "${tabName}" | Headers: ${headers.length} | Rows: ${rows.length}`)

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`❌ Insight extraction for "${tabName}" did not return an array`)
      return []
    }

    // LOG: What AI returned
    if (parsed.length === 0) {
      console.log(`⚠️  Tab "${tabName}": AI found 0 insights (likely no qualitative notes in data)`)
    } else {
      console.log(`✅ Tab "${tabName}": Extracted ${parsed.length} insights`)
    }

    return parsed.map((insight: any) => ({
      category: insight.category || 'performance',
      sentiment: insight.sentiment || 'neutral',
      title: insight.title || '',
      description: insight.description || '',
      sourceType: insight.sourceType || 'ai_detected',
      confidence: insight.confidence || 'medium',
      influencerName: insight.influencerName || undefined,
      campaignName: insight.campaignName || undefined,
      platform: insight.platform || undefined,
      year: insight.year || year || undefined,
      quarter: insight.quarter || undefined,
    }))
  } catch (error) {
    console.error(`Failed to extract insights from tab "${tabName}":`, error)
    return []
  }
}

// ============================================================================
// INFLUENCER NOTES EXTRACTION
// ============================================================================

export async function extractInfluencerNotes(
  brandId: string,
  prisma: PrismaClient
): Promise<ExtractedInfluencerNote[]> {
  // Get all campaign records for this brand with influencer names
  const campaigns = await prisma.campaignRecord.findMany({
    where: { brandId },
    select: {
      influencerName: true,
      platform: true,
      status: true,
      dealValue: true,
      contentType: true,
      year: true,
      rawData: true,
    },
  })

  // Guard: No data to analyze
  if (campaigns.length === 0) {
    console.log(`⚠️  No campaign data to extract influencer notes from`)
    return []
  }

  // Group by influencer
  const influencerMap = new Map<string, any[]>()
  for (const campaign of campaigns) {
    if (!campaign.influencerName) continue
    const key = campaign.influencerName.toLowerCase().trim()
    if (!influencerMap.has(key)) {
      influencerMap.set(key, [])
    }
    influencerMap.get(key)!.push(campaign)
  }

  // Sample influencers to control token usage (max 30 influencers)
  const influencersToAnalyze = Array.from(influencerMap.entries()).slice(0, 30)
  const hasMore = influencerMap.size > 30

  const systemPrompt = `You are a talent relationship analyst that extracts performance notes and observations about influencers.
Your job is to synthesize campaign data into actionable notes about each influencer's reliability, quality, and fit.
You must respond with ONLY valid JSON - no explanations or markdown.`

  const userPrompt = `Analyze campaign history to extract notes about influencer performance and reliability.

Influencer campaign data (${influencersToAnalyze.length} of ${influencerMap.size} influencers${hasMore ? ' - showing sample' : ''}):
${JSON.stringify(
    influencersToAnalyze.map(([name, campaigns]) => ({
      influencerName: campaigns[0].influencerName,
      totalCampaigns: campaigns.length,
      platforms: Array.from(new Set(campaigns.map(c => c.platform).filter(Boolean))),
      statuses: campaigns.map(c => c.status).filter(Boolean),
      dealValues: campaigns.map(c => c.dealValue).filter(Boolean),
      contentTypes: campaigns.map(c => c.contentType).filter(Boolean),
      years: Array.from(new Set(campaigns.map(c => c.year).filter(Boolean))),
    })),
    null,
    2
  )}

TASK: Extract performance notes about each influencer based on their campaign history.

NOTE TYPES:
- "performance": Engagement, conversion, reach performance patterns
- "reliability": Consistency, responsiveness, delivery track record
- "creative_quality": Content quality, brand alignment, creative execution
- "audience_fit": How well their audience matches brand's target
- "communication": Ease of working with, professionalism

SENTIMENT:
- "positive": Strong performer, reliable partner
- "negative": Underperformance or issues
- "neutral": Mixed or average results

CONFIDENCE LEVELS:
- "high": Clear pattern across multiple campaigns (3+ campaigns)
- "medium": Pattern across 2 campaigns or strong signal from 1
- "low": Limited data or weak signal

IMPORTANT RULES:
1. Only create notes based on ACTUAL DATA PATTERNS, not assumptions
2. Look for: repeated statuses, multiple campaigns, deal value trends
3. If influencer has 3+ campaigns with same platform → note reliability on that platform
4. If status patterns show "Completed" consistently → positive reliability note
5. If deal values increase over time → positive performance note
6. DO NOT create notes for influencers with only 1 campaign unless there's strong signal
7. Specify the year if pattern is time-specific

EXAMPLES:
- Influencer with 5 campaigns all "Completed" → "reliability" note, positive, high confidence
- Influencer with increasing deal values → "performance" note, positive, medium confidence
- Influencer with only 1 campaign → probably skip unless rawData has explicit notes

Return JSON array:
[
  {
    "influencerName": "Influencer X",
    "noteType": "reliability",
    "sentiment": "positive",
    "content": "Consistently delivered across 5 campaigns over 2 years, all marked as completed",
    "sourceType": "campaign_data",
    "confidence": "high",
    "year": 2024
  }
]

If no meaningful notes can be extracted, return: []`

  console.log(`[Note Extract] Analyzing ${influencersToAnalyze.length} influencers for performance notes`)

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`❌ Influencer note extraction did not return an array`)
      return []
    }

    console.log(`✅ Extracted ${parsed.length} influencer notes`)

    return parsed.map((note: any) => ({
      influencerName: note.influencerName || '',
      noteType: note.noteType || 'performance',
      sentiment: note.sentiment || 'neutral',
      content: note.content || '',
      sourceType: note.sourceType || 'ai_extracted',
      confidence: note.confidence || 'medium',
      year: note.year || undefined,
    }))
  } catch (error) {
    console.error(`Failed to extract influencer notes:`, error)
    return []
  }
}

// ============================================================================
// TREND DETECTION
// ============================================================================

export async function detectTrends(
  brandId: string,
  prisma: PrismaClient
): Promise<ExtractedTrend[]> {
  // Get brand with all campaign data
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      campaignRecords: {
        orderBy: { year: 'asc' },
      },
      brandInfluencers: {
        orderBy: { totalCampaigns: 'desc' },
        take: 20,
      },
    },
  })

  // Guard: No data to analyze
  if (!brand || brand.campaignRecords.length < 5) {
    console.log(`⚠️  Insufficient data for trend detection (need 5+ campaigns)`)
    return []
  }

  // Prepare aggregated data for trend analysis
  const platformTrends = new Map<string, { years: Map<number, number> }>()
  const yearlySpend: Map<number, number> = new Map()
  const yearlyInfluencerCount: Map<number, Set<string>> = new Map()
  const contentTypeTrends = new Map<string, number>()

  for (const campaign of brand.campaignRecords) {
    // Platform trends by year
    if (campaign.platform && campaign.year) {
      if (!platformTrends.has(campaign.platform)) {
        platformTrends.set(campaign.platform, { years: new Map() })
      }
      const platformData = platformTrends.get(campaign.platform)!
      platformData.years.set(
        campaign.year,
        (platformData.years.get(campaign.year) || 0) + 1
      )
    }

    // Yearly influencer count
    if (campaign.year && campaign.influencerName) {
      if (!yearlyInfluencerCount.has(campaign.year)) {
        yearlyInfluencerCount.set(campaign.year, new Set())
      }
      yearlyInfluencerCount.get(campaign.year)!.add(campaign.influencerName)
    }

    // Content type trends
    if (campaign.contentType) {
      contentTypeTrends.set(
        campaign.contentType,
        (contentTypeTrends.get(campaign.contentType) || 0) + 1
      )
    }
  }

  const systemPrompt = `You are a marketing data analyst that identifies meaningful trends and patterns in campaign data.
Your job is to detect growth, decline, seasonal patterns, and strategic shifts.
You must respond with ONLY valid JSON - no explanations or markdown.`

  const userPrompt = `Analyze campaign data to detect meaningful trends for "${brand.name}".

PLATFORM ACTIVITY BY YEAR:
${JSON.stringify(
    Array.from(platformTrends.entries()).map(([platform, data]) => ({
      platform,
      yearlyActivity: Object.fromEntries(data.years),
    })),
    null,
    2
  )}

YEARLY INFLUENCER COUNT:
${JSON.stringify(
    Array.from(yearlyInfluencerCount.entries()).map(([year, influencers]) => ({
      year,
      uniqueInfluencers: influencers.size,
    })),
    null,
    2
  )}

CONTENT TYPE DISTRIBUTION:
${JSON.stringify(Object.fromEntries(contentTypeTrends), null, 2)}

TOTAL CAMPAIGNS: ${brand.campaignRecords.length}
YEARS OF DATA: ${Array.from(new Set(brand.campaignRecords.map(c => c.year).filter(Boolean))).sort().join(', ')}

TASK: Identify significant trends in this data.

TREND TYPES:
- "growth": Increasing activity on a platform, growing influencer roster
- "decline": Decreasing activity or abandoning a platform
- "seasonal": Patterns tied to specific quarters or months
- "platform_shift": Moving from one platform to another
- "budget_change": Changes in spending patterns

METRICS TO ANALYZE:
- "platform_activity": Campaigns per platform over time
- "influencer_count": Number of unique influencers over time
- "content_type": Shifts in content formats
- "campaign_volume": Overall campaign activity

DIRECTION:
- "increasing": Clear upward trend (20%+ growth)
- "decreasing": Clear downward trend (20%+ decline)
- "stable": Consistent activity
- "volatile": Significant ups and downs

CONFIDENCE:
- "high": Multiple years of data, clear pattern (3+ data points)
- "medium": 2 years of data or moderate pattern
- "low": Limited data or weak signal

IMPORTANT RULES:
1. Only report trends with statistical backing (real numbers)
2. Calculate magnitude as percentage change between earliest and latest
3. Require at least 2 years of data for year-over-year trends
4. Look for patterns, not random fluctuations
5. If a platform goes from 5 campaigns to 15 campaigns → "growth" trend
6. If influencer count increases year-over-year → "growth" trend
7. DO NOT report trends without clear directional movement

EXAMPLES:
- Instagram campaigns: 2023=10, 2024=25 → growth trend, +150%, high confidence
- Influencer roster: 2023=8, 2024=12 → growth trend, +50%, medium confidence
- TikTok campaigns: 2023=15, 2024=3 → decline trend, -80%, high confidence

Return JSON array:
[
  {
    "trendType": "growth",
    "metric": "platform_activity",
    "direction": "increasing",
    "title": "Instagram campaign volume growing",
    "description": "Instagram campaigns increased from 10 in 2023 to 25 in 2024, representing 150% growth",
    "magnitude": 150.0,
    "confidence": "high",
    "timeframe": "2023-2024",
    "platforms": ["Instagram"]
  }
]

If no meaningful trends detected, return: []`

  console.log(`[Trend Detect] Analyzing ${brand.campaignRecords.length} campaigns for trends`)

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt, 2000)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`❌ Trend detection did not return an array`)
      return []
    }

    console.log(`✅ Detected ${parsed.length} trends`)

    return parsed.map((trend: any) => ({
      trendType: trend.trendType || 'growth',
      metric: trend.metric || 'platform_activity',
      direction: trend.direction || 'stable',
      title: trend.title || '',
      description: trend.description || '',
      magnitude: trend.magnitude || undefined,
      confidence: trend.confidence || 'medium',
      timeframe: trend.timeframe || '',
      platforms: trend.platforms || undefined,
      influencers: trend.influencers || undefined,
    }))
  } catch (error) {
    console.error(`Failed to detect trends:`, error)
    return []
  }
}

// ============================================================================
// STRATEGIC RECOMMENDATIONS
// ============================================================================

export async function generateStrategicRecommendations(
  brandId: string,
  prisma: PrismaClient
): Promise<Array<{
  category: string
  priority: string
  title: string
  recommendation: string
  rationale: string
  confidence: string
  expectedImpact?: string
  effort?: string
  timeframe?: string
}>> {
  // Get comprehensive brand data
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: {
      brandInfluencers: {
        orderBy: { totalCampaigns: 'desc' },
        take: 10,
      },
      campaignRecords: true,
      trendAnalyses: {
        where: { status: 'active' },
        orderBy: { detectedAt: 'desc' },
        take: 5,
      },
      brandLearnings: {
        where: { status: 'active' },
        orderBy: { priority: 'desc' },
        take: 5,
      },
    },
  })

  // Guard: No data
  if (!brand || brand.campaignRecords.length < 3) {
    console.log(`⚠️  Insufficient data for recommendations (need 3+ campaigns)`)
    return []
  }

  // Parse brand intelligence
  let intelligence: any = {}
  if (brand.brandIntelligence) {
    try {
      intelligence = JSON.parse(brand.brandIntelligence)
    } catch {}
  }

  const systemPrompt = `You are a strategic marketing advisor that provides actionable, data-driven recommendations.
Your job is to analyze campaign history, trends, and learnings to suggest concrete improvements.
You must respond with ONLY valid JSON - no explanations or markdown.`

  const userPrompt = `Generate strategic recommendations for "${brand.name}" based on their campaign data.

BRAND INTELLIGENCE:
${JSON.stringify(intelligence, null, 2)}

TOP INFLUENCERS:
${JSON.stringify(
    brand.brandInfluencers.map(i => ({
      name: i.name,
      platform: i.platform,
      campaigns: i.totalCampaigns,
      rate: i.estimatedRate,
    })),
    null,
    2
  )}

ACTIVE TRENDS:
${JSON.stringify(
    brand.trendAnalyses.map(t => ({
      type: t.trendType,
      metric: t.metric,
      direction: t.direction,
      title: t.title,
    })),
    null,
    2
  )}

BRAND LEARNINGS:
${JSON.stringify(
    brand.brandLearnings.map(l => ({
      category: l.category,
      title: l.title,
      recommendation: l.recommendation,
    })),
    null,
    2
  )}

TOTAL CAMPAIGNS: ${brand.campaignRecords.length}

TASK: Generate 3-5 strategic, actionable recommendations based on this data.

CATEGORIES:
- "budget": Budget allocation, cost optimization
- "influencer_selection": Who to work with, roster expansion
- "platform": Platform strategy, channel mix
- "content_type": Content format optimization
- "timing": Campaign timing, seasonal strategies

PRIORITY:
- "high": Significant impact opportunity, should act soon
- "medium": Valuable but not urgent
- "low": Nice to have, long-term consideration
- "urgent": Critical issue or time-sensitive opportunity

EFFORT (implementation difficulty):
- "low": Easy to implement, minimal resources
- "medium": Moderate effort required
- "high": Significant resources or change needed

CONFIDENCE:
- "high": Strong data backing (10+ relevant campaigns)
- "medium": Moderate data backing (5-10 campaigns)
- "low": Limited data, more exploratory

IMPORTANT RULES:
1. Base recommendations on ACTUAL DATA PATTERNS
2. Be specific (e.g., "Increase Instagram Reels by 30%" not "Focus on video")
3. Include concrete rationale tied to numbers/trends
4. Estimate impact when possible (e.g., "Could reduce costs by 15%")
5. Suggest realistic timeframes
6. Don't recommend what they're already doing well
7. Look for gaps, inefficiencies, or growth opportunities

EXAMPLES OF GOOD RECOMMENDATIONS:
- If TikTok growing +150%: "Double down on TikTok, allocate 40% of Q1 budget here"
- If top influencer has 8 campaigns: "Establish retainer with [Name] for 20% cost savings"
- If no campaigns in Q4: "Test Q4 holiday campaigns, historically strong for category"

Return JSON array:
[
  {
    "category": "platform",
    "priority": "high",
    "title": "Expand TikTok investment based on 150% growth trend",
    "recommendation": "Increase TikTok campaign allocation from current 25% to 40% of total budget for Q1 2025",
    "rationale": "TikTok campaigns grew 150% YoY (2023: 10 campaigns, 2024: 25 campaigns) with strong engagement",
    "confidence": "high",
    "expectedImpact": "Projected 25-30% increase in overall reach and engagement",
    "effort": "low",
    "timeframe": "Q1 2025"
  }
]

Return 3-5 recommendations ordered by priority. If insufficient data, return: []`

  console.log(`[Recommendations] Generating strategic recommendations for ${brand.name}`)

  try {
    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt, 2000)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`❌ Recommendation generation did not return an array`)
      return []
    }

    console.log(`✅ Generated ${parsed.length} strategic recommendations`)

    return parsed.map((rec: any) => ({
      category: rec.category || 'platform',
      priority: rec.priority || 'medium',
      title: rec.title || '',
      recommendation: rec.recommendation || '',
      rationale: rec.rationale || '',
      confidence: rec.confidence || 'medium',
      expectedImpact: rec.expectedImpact || undefined,
      effort: rec.effort || undefined,
      timeframe: rec.timeframe || undefined,
    }))
  } catch (error) {
    console.error(`Failed to generate recommendations:`, error)
    return []
  }
}

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

// Store extracted insights in database
export async function storeInsights(
  brandId: string,
  trackerId: string,
  insights: ExtractedInsight[],
  prisma: PrismaClient
): Promise<number> {
  if (insights.length === 0) return 0

  try {
    await prisma.campaignInsight.createMany({
      data: insights.map(insight => ({
        brandId,
        trackerId,
        category: insight.category,
        sentiment: insight.sentiment,
        title: insight.title,
        description: insight.description,
        sourceType: insight.sourceType,
        sourceRef: JSON.stringify({ column: 'Notes' }),
        confidence: insight.confidence,
        influencerName: insight.influencerName || null,
        campaignName: insight.campaignName || null,
        platform: insight.platform || null,
        year: insight.year || null,
        quarter: insight.quarter || null,
      })),
    })

    console.log(`💾 Stored ${insights.length} insights for brand ${brandId}`)
    return insights.length
  } catch (error) {
    console.error('Failed to store insights:', error)
    return 0
  }
}

// Store extracted influencer notes in database
export async function storeInfluencerNotes(
  brandId: string,
  notes: ExtractedInfluencerNote[],
  prisma: PrismaClient
): Promise<number> {
  if (notes.length === 0) return 0

  try {
    // Get influencer IDs
    const influencerNames = notes.map(n => n.influencerName)
    const influencers = await prisma.brandInfluencer.findMany({
      where: {
        brandId,
        name: { in: influencerNames },
      },
      select: { id: true, name: true },
    })

    const influencerMap = new Map(influencers.map(i => [i.name.toLowerCase().trim(), i.id]))

    // Filter to only notes where we found the influencer
    const validNotes = notes.filter(n => influencerMap.has(n.influencerName.toLowerCase().trim()))

    if (validNotes.length === 0) {
      console.log(`⚠️  No matching influencers found for ${notes.length} notes`)
      return 0
    }

    await prisma.influencerNote.createMany({
      data: validNotes.map(note => ({
        brandId,
        influencerId: influencerMap.get(note.influencerName.toLowerCase().trim())!,
        noteType: note.noteType,
        sentiment: note.sentiment,
        content: note.content,
        sourceType: note.sourceType,
        confidence: note.confidence,
        year: note.year || null,
      })),
    })

    console.log(`💾 Stored ${validNotes.length} influencer notes`)
    return validNotes.length
  } catch (error) {
    console.error('Failed to store influencer notes:', error)
    return 0
  }
}

// Store detected trends in database
export async function storeTrends(
  brandId: string,
  trends: ExtractedTrend[],
  prisma: PrismaClient
): Promise<number> {
  if (trends.length === 0) return 0

  try {
    await prisma.trendAnalysis.createMany({
      data: trends.map(trend => ({
        brandId,
        trendType: trend.trendType,
        metric: trend.metric,
        direction: trend.direction,
        title: trend.title,
        description: trend.description,
        dataPoints: JSON.stringify({ platforms: trend.platforms, influencers: trend.influencers }),
        magnitude: trend.magnitude || null,
        confidence: trend.confidence,
        timeframe: trend.timeframe,
        platforms: trend.platforms ? JSON.stringify(trend.platforms) : null,
        influencers: trend.influencers ? JSON.stringify(trend.influencers) : null,
        status: 'active',
      })),
    })

    console.log(`💾 Stored ${trends.length} trends`)
    return trends.length
  } catch (error) {
    console.error('Failed to store trends:', error)
    return 0
  }
}

// Store strategic recommendations in database
export async function storeRecommendations(
  brandId: string,
  recommendations: Array<{
    category: string
    priority: string
    title: string
    recommendation: string
    rationale: string
    confidence: string
    expectedImpact?: string
    effort?: string
    timeframe?: string
  }>,
  prisma: PrismaClient
): Promise<number> {
  if (recommendations.length === 0) return 0

  try {
    await prisma.strategicRecommendation.createMany({
      data: recommendations.map(rec => ({
        brandId,
        category: rec.category,
        priority: rec.priority,
        title: rec.title,
        recommendation: rec.recommendation,
        rationale: rec.rationale,
        basedOn: JSON.stringify({ source: 'ai_analysis' }),
        confidence: rec.confidence,
        expectedImpact: rec.expectedImpact || null,
        effort: rec.effort || null,
        timeframe: rec.timeframe || null,
        status: 'pending',
      })),
    })

    console.log(`💾 Stored ${recommendations.length} recommendations`)
    return recommendations.length
  } catch (error) {
    console.error('Failed to store recommendations:', error)
    return 0
  }
}

// ============================================================================
// DATA QUALITY DETECTION
// ============================================================================

// Detect data quality issues during sync
export async function detectDataQualityIssues(
  brandId: string,
  trackerId: string,
  prisma: PrismaClient
): Promise<number> {
  const issues: Array<{
    entityType: string
    entityId: string
    issueType: string
    severity: string
    description: string
    affectedFields?: string
  }> = []

  try {
    // Check for missing critical fields
    const recordsWithoutInfluencer = await prisma.campaignRecord.count({
      where: { brandId, trackerId, influencerName: null },
    })
    if (recordsWithoutInfluencer > 0) {
      issues.push({
        entityType: 'campaign',
        entityId: trackerId,
        issueType: 'missing_data',
        severity: 'medium',
        description: `${recordsWithoutInfluencer} campaign records missing influencer names`,
        affectedFields: JSON.stringify(['influencerName']),
      })
    }

    // Check for campaigns without deal values
    const recordsWithoutValue = await prisma.campaignRecord.count({
      where: { brandId, trackerId, dealValue: null, totalValue: null },
    })
    if (recordsWithoutValue > 0) {
      issues.push({
        entityType: 'campaign',
        entityId: trackerId,
        issueType: 'missing_data',
        severity: 'low',
        description: `${recordsWithoutValue} campaign records missing deal values`,
        affectedFields: JSON.stringify(['dealValue', 'totalValue']),
      })
    }

    // Check for outlier deal values (statistical outliers)
    const dealValues = await prisma.campaignRecord.findMany({
      where: { brandId, trackerId, totalValue: { not: null } },
      select: { id: true, totalValue: true },
    })

    if (dealValues.length > 5) {
      const values = dealValues.map(d => d.totalValue!).filter(v => v > 0)
      const avg = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length
      const stdDev = Math.sqrt(variance)

      const outliers = dealValues.filter(d => {
        const val = d.totalValue!
        return Math.abs(val - avg) > 3 * stdDev
      })

      if (outliers.length > 0) {
        issues.push({
          entityType: 'campaign',
          entityId: trackerId,
          issueType: 'outlier_value',
          severity: 'low',
          description: `${outliers.length} deal values are statistical outliers (>3 std dev from mean)`,
          affectedFields: JSON.stringify(['totalValue']),
        })
      }
    }

    // Store issues in database
    if (issues.length > 0) {
      await prisma.dataQualityFlag.createMany({
        data: issues.map(issue => ({
          brandId,
          entityType: issue.entityType,
          entityId: issue.entityId,
          issueType: issue.issueType,
          severity: issue.severity,
          description: issue.description,
          affectedFields: issue.affectedFields || null,
          status: 'open',
        })),
      })
    }

    if (issues.length > 0) {
      console.log(`⚠️  Detected ${issues.length} data quality issues for brand ${brandId}`)
    }

    return issues.length
  } catch (error) {
    console.error('Failed to detect data quality issues:', error)
    return 0
  }
}

// ============================================================================
// BRAND LEARNINGS - Strategic insights from aggregated data
// ============================================================================

/**
 * Generate brand-level strategic learnings by analyzing insights and trends
 * Called after tracker sync to auto-update brand intelligence
 */
export async function generateBrandLearnings(
  brandId: string,
  prisma: PrismaClient
): Promise<number> {
  console.log(`[Brand Learnings] Generating strategic learnings for brand ${brandId}`)

  try {
    // Get brand with related data - OPTIMIZED: only load what we actually use in prompt
    // This reduces query time and memory usage significantly
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        // Campaign insights - we only use 20 in prompt
        campaignInsights: {
          orderBy: { createdAt: 'desc' },
          take: 25,  // Reduced from 100
        },
        // Trend analyses - we use all in prompt
        trendAnalyses: {
          where: { status: 'active' },
          orderBy: { detectedAt: 'desc' },
          take: 15,  // Reduced from 30
        },
        // Campaign records - we only use 40 in prompt
        campaignRecords: {
          select: {
            platform: true,
            year: true,
            quarter: true,
            status: true,
            dealValue: true,
            totalValue: true,
            contentType: true,
            influencerName: true,
            handle: true,
            campaignName: true,
            recordType: true,
            contractType: true,
            deliverables: true,
            paymentTerms: true,
            usageRights: true,
            exclusivity: true,
          },
          take: 50,  // Reduced from 200
        },
        // Influencer notes - we only use 30 in prompt
        influencerNotes: {
          orderBy: { createdAt: 'desc' },
          take: 35,  // Reduced from 100
          include: {
            influencer: {
              select: { name: true },
            },
          },
        },
        // Influencer roster - we use all in prompt
        brandInfluencers: {
          select: {
            name: true,
            platform: true,
            totalCampaigns: true,
            estimatedRate: true,
            engagementRate: true,
            followerCount: true,
            deliverables: true,
            notes: true,
          },
          take: 25,  // Reduced from 50
        },
      },
    })

    if (!brand) {
      console.log(`[Brand Learnings] Brand ${brandId} not found`)
      return 0
    }

    // Check for ANY meaningful data to learn from
    const hasData =
      brand.campaignRecords.length >= 3 ||
      brand.campaignInsights.length > 0 ||
      brand.trendAnalyses.length > 0 ||
      brand.influencerNotes.length > 0 ||
      brand.brandInfluencers.length > 0

    if (!hasData) {
      console.log(`[Brand Learnings] Skipping - insufficient data (need 3+ campaigns or other data)`)
      return 0
    }

    console.log(`[Brand Learnings] Data sources:`, {
      campaigns: brand.campaignRecords.length,
      insights: brand.campaignInsights.length,
      trends: brand.trendAnalyses.length,
      influencerNotes: brand.influencerNotes.length,
      influencers: brand.brandInfluencers.length,
    })

    const systemPrompt = `You are a strategic marketing analyst that synthesizes campaign data into high-level brand learnings.
Your job is to identify cross-campaign patterns and generate actionable strategic recommendations.
You must respond with ONLY valid JSON - no explanations or markdown.`

    const userPrompt = `Synthesize strategic learnings for "${brand.name}" from ALL available data.

CAMPAIGN DATA (${brand.campaignRecords.length} campaigns):
${JSON.stringify(brand.campaignRecords.slice(0, 40).map(c => ({
  campaign: c.campaignName,
  influencer: c.influencerName,
  handle: c.handle,
  platform: c.platform,
  year: c.year,
  quarter: c.quarter,
  status: c.status,
  dealValue: c.dealValue,
  contentType: c.contentType,
  deliverables: c.deliverables,
  paymentTerms: c.paymentTerms,
  usageRights: c.usageRights,
  exclusivity: c.exclusivity,
})), null, 2)}

INFLUENCER ROSTER (${brand.brandInfluencers.length} influencers):
${JSON.stringify(brand.brandInfluencers.map(i => ({
  name: i.name,
  platform: i.platform,
  campaigns: i.totalCampaigns,
  rate: i.estimatedRate,
  engagement: i.engagementRate,
  followers: i.followerCount,
  notes: i.notes,
})), null, 2)}

INFLUENCER PERFORMANCE NOTES (${brand.influencerNotes.length} observations):
${JSON.stringify(brand.influencerNotes.slice(0, 30).map(n => ({
  influencer: n.influencer?.name || 'Unknown',
  type: n.noteType,
  sentiment: n.sentiment,
  note: n.content,
})), null, 2)}

${brand.campaignInsights.length > 0 ? `CAMPAIGN INSIGHTS (${brand.campaignInsights.length}):
${JSON.stringify(brand.campaignInsights.slice(0, 20).map(i => ({
  category: i.category,
  sentiment: i.sentiment,
  title: i.title,
  platform: i.platform,
  year: i.year,
})), null, 2)}` : ''}

${brand.trendAnalyses.length > 0 ? `DETECTED TRENDS (${brand.trendAnalyses.length}):
${JSON.stringify(brand.trendAnalyses.map(t => ({
  type: t.trendType,
  metric: t.metric,
  direction: t.direction,
  title: t.title,
  timeframe: t.timeframe,
})), null, 2)}` : ''}

DATA SUMMARY:
- Total campaigns: ${brand.campaignRecords.length}
- Influencer roster size: ${brand.brandInfluencers.length}
- Platforms: ${Array.from(new Set(brand.campaignRecords.map(c => c.platform).filter(Boolean))).join(', ') || 'Various'}
- Years covered: ${Array.from(new Set(brand.campaignRecords.map(c => c.year).filter(Boolean))).join(', ') || 'Various'}

TASK: Generate 3-7 strategic learnings that would help this brand optimize their influencer marketing.

LEARNING CATEGORIES:
- "platform_strategy": Which platforms work best, where to allocate budget
- "budget_optimization": How to spend more efficiently, deal value patterns
- "content_type": What content formats perform well
- "timing": Seasonal patterns, best times to run campaigns
- "influencer_relationships": Top performers, who to prioritize, red flags
- "contract_patterns": Payment terms, usage rights, exclusivity insights
- "audience": Target audience insights and fit

PRIORITY LEVELS:
- "critical": Urgent, high-impact action needed
- "high": Important strategic shift recommended
- "medium": Valuable optimization opportunity
- "low": Minor improvement suggestion

IMPORTANT RULES:
1. Base learnings on ACTUAL PATTERNS in the data, not generic advice
2. Be specific: reference platforms, timeframes, metrics
3. Include actionable recommendations
4. Higher priority for learnings backed by multiple insights/trends
5. Confidence should match data quality (high = 10+ supporting data points, medium = 5-9, low = 2-4)
6. Focus on what's working AND what needs improvement
7. Consider budget implications

Return JSON array:
[
  {
    "category": "platform_strategy",
    "priority": "high",
    "title": "Instagram Reels driving 40% higher engagement than static posts",
    "description": "Analysis of 2024 campaigns shows consistent pattern of Reels outperforming traditional posts across 15 campaigns with 5+ different creators",
    "recommendation": "Shift 60% of Instagram budget to Reels-focused creators and content",
    "confidence": "high",
    "sampleSize": 15,
    "platforms": ["Instagram"],
    "timeframe": "2024"
  }
]

If insufficient data for meaningful learnings, return: []`

    console.log(`[Brand Learnings] Synthesizing from all data sources...`)

    const response = await getCheapStructuredCompletion(systemPrompt, userPrompt)
    const parsed = parseJSONResponse(response)

    if (!Array.isArray(parsed)) {
      console.log(`[Brand Learnings] AI did not return an array`)
      return 0
    }

    console.log(`[Brand Learnings] Generated ${parsed.length} learnings`)

    // BATCHED: Use transaction with deleteMany + createMany instead of sequential upserts
    // This is much faster than N individual upsert calls
    const learningsData = parsed.map(learning => ({
      brandId,
      category: learning.category || 'platform_strategy',
      priority: learning.priority || 'medium',
      title: learning.title || 'Untitled Learning',
      description: learning.description || '',
      recommendation: learning.recommendation || null,
      confidence: learning.confidence || 'medium',
      sampleSize: learning.sampleSize || null,
      platforms: learning.platforms ? JSON.stringify(learning.platforms) : null,
      timeframe: learning.timeframe || null,
      status: 'active',
    }))

    // Delete old learnings and create new ones in a single transaction
    await prisma.$transaction(async (tx) => {
      // Remove existing active learnings for this brand
      await tx.brandLearning.deleteMany({
        where: { brandId, status: 'active' },
      })

      // Create all new learnings in one operation
      if (learningsData.length > 0) {
        await tx.brandLearning.createMany({
          data: learningsData,
        })
      }
    })

    console.log(`[Brand Learnings] Created ${parsed.length} learnings (batch operation)`)

    return parsed.length
  } catch (error) {
    console.error('[Brand Learnings] Failed to generate learnings:', error)
    return 0
  }
}
