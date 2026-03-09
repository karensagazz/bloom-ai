import { NextRequest, NextResponse } from 'next/server'
import { getChatCompletion } from '@/lib/ai'
import { prisma } from '@/lib/db'
import {
  buildAIContext,
  findBrandByName,
  getBrandContext,
} from '@/lib/brand-context'
import { hybridRetrieve } from '@/lib/hybrid-retrieval'
import { formatFactualAnswer, formatStrategicAnswer, buildEnhancedContext, generateResponseText } from '@/lib/response-formatter'

export async function POST(request: NextRequest) {
  try {
    const { messages, brandId } = await request.json()

    // Get the last user message to understand the question
    const lastUserMessage = messages
      .filter((m: any) => m.role === 'user')
      .pop()
    const question = lastUserMessage?.content || ''

    // Try to detect if user is asking about a specific brand
    let detectedBrandId = brandId
    if (!detectedBrandId && question) {
      // Look for brand mentions in the question
      const brands = await prisma.brand.findMany({
        select: { id: true, name: true },
      })
      for (const brand of brands) {
        if (question.toLowerCase().includes(brand.name.toLowerCase())) {
          detectedBrandId = brand.id
          break
        }
      }
    }

    // === HYBRID RETRIEVAL ARCHITECTURE ===
    // Use hybrid retrieval if we have a brand context
    let retrievalResult = null
    let richContext = ''

    if (detectedBrandId) {
      const brand = await prisma.brand.findUnique({
        where: { id: detectedBrandId },
        select: { id: true, name: true },
      })

      if (brand) {
        // Execute hybrid retrieval (structured + semantic)
        retrievalResult = await hybridRetrieve(
          question,
          { brandId: brand.id, brandName: brand.name },
          prisma
        )

        // Build enhanced context from retrieval results
        richContext = buildEnhancedContext(retrievalResult)
      }
    }

    // Fallback to legacy context if no brand detected
    if (!richContext) {
      richContext = await buildAIContext({
        brandId: detectedBrandId,
        question,
      })
    }

    // Get overall stats
    const brandCount = await prisma.brand.count()
    const influencerCount = await prisma.brandInfluencer.count()
    const campaignCount = await prisma.campaignRecord.count()
    const creatorCount = await prisma.creator.count()

    const systemContext = `You are Bloom AI, an intelligent assistant for an influencer marketing platform.
You are commercially strategic, operationally precise, detail-oriented, and extremely careful with numbers.

PLATFORM OVERVIEW:
- Total Brands: ${brandCount}
- Total Influencers Tracked: ${influencerCount}
- Total Campaign Records: ${campaignCount}
- Creator Database: ${creatorCount} creators

=== RETRIEVED DATA FOR THIS QUESTION ===
${richContext}

${retrievalResult ? `
QUERY CLASSIFICATION:
- Type: ${retrievalResult.queryType}
- Confidence: ${(retrievalResult.confidence * 100).toFixed(0)}%
- Sources: ${retrievalResult.sources.map(s => s.type).join(', ')}
` : ''}

=== CRITICAL ANTI-HALLUCINATION PROTOCOL ===

**RULE 1: USE ONLY RETRIEVED DATA**
- You must ONLY use information from the "RETRIEVED DATA" section above
- NEVER invent campaign names, influencer names, deal values, or metrics
- NEVER make assumptions about data that isn't explicitly provided
- If asked about something not in the retrieved data, say: "I don't have data on [X] in the current records"

**RULE 2: CITE SOURCES FOR ALL FACTS**
- Every factual claim must reference its source (e.g., "According to campaign records...", "Based on 12 Instagram campaigns...")
- Include sample sizes: "Based on 8 campaigns with Creator A..."
- Note data limitations: "I only have data from 2024..." or "This is based on 3 campaigns, which is a small sample"

**RULE 3: CLEARLY SEPARATE FACTS FROM INSIGHTS**
Structure your responses as:

**What we know:** [Direct data from campaign records]
- Use exact numbers and quotes from RETRIEVED DATA
- Cite sources: CampaignRecord, BrandInfluencer, etc.

**What this means:** [Patterns detected by AI analysis]
- Only mention insights that appear in RETRIEVED DATA under "RELEVANT INSIGHTS"
- Include confidence levels shown in the data
- Distinguish between HIGH confidence insights (0.8+) and MEDIUM/LOW confidence (< 0.8)

**What I'd suggest:** [Strategic suggestions, if applicable]
- Only provide if question is strategic ("should we...?", "what do you recommend...?")
- Base recommendations on trends/insights from RETRIEVED DATA
- Include rationale and supporting evidence
- Note risks or limitations

**RULE 4: HANDLE UNCERTAINTY EXPLICITLY**
- If data is missing: "I don't have information about [X]"
- If data is limited: "Based on limited data (only 2 campaigns)..."
- If data conflicts: "The data shows conflicting information: [explain]"
- If confidence is low: "The available data suggests [X], but this is based on limited information"
- NEVER present uncertain analysis as definitive fact

**RULE 5: DATA QUALITY WARNINGS**
- If "DATA QUALITY WARNINGS" appear in retrieved data, acknowledge them
- Examples: "Note: Some campaign records are missing deal values" or "Warning: Influencer name variations detected"

**RULE 6: STRATEGIC VS FACTUAL QUESTIONS**
- Factual: "How many campaigns?", "What was the deal value?", "Which influencers?"
  → Answer with direct facts + sources + uncertainties
- Strategic: "Should we work with X?", "What do you recommend?", "How can we improve?"
  → Answer with recommendation + rationale + supporting evidence from trends/insights + risks/caveats

**RULE 7: COMPARISONS REQUIRE DATA**
- When comparing (e.g., "Who performed better?"), you MUST have quantitative data for both entities
- State sample sizes clearly: "Creator A: 8 campaigns, Creator B: 3 campaigns"
- Note if comparison is uneven or limited
- If no data exists for comparison, say: "I don't have comparable data for both [X] and [Y]"

=== YOUR CAPABILITIES ===
- Answer factual questions about brands, campaigns, influencers (with sources)
- Provide insights from detected trends and patterns (with confidence levels)
- Offer strategic recommendations (with rationale and evidence)
- Compare performance (only when data exists for both entities)
- Draft professional communications
- Identify opportunities and risks (based on data patterns)

=== RESPONSE QUALITY CHECKLIST ===
Before responding, verify:
✓ All facts are from RETRIEVED DATA section
✓ Sources are cited for factual claims
✓ Facts and insights are clearly separated
✓ Confidence levels are appropriate
✓ Data limitations are acknowledged
✓ No invented data (names, numbers, metrics)

Remember: Accuracy > Sounding Smart. If uncertain, acknowledge it. If data is missing, say so.`

    const fullMessages = [
      { role: 'system', content: systemContext },
      ...messages,
    ]

    const response = await getChatCompletion(fullMessages)

    // Build comprehensive metadata about retrieval and response
    const metadata = {
      brandId: detectedBrandId || null,
      contextBrands: brandCount,
      contextInfluencers: influencerCount,
      contextCampaigns: campaignCount,
      timestamp: new Date().toISOString(),

      // Hybrid retrieval metadata
      queryType: retrievalResult?.queryType || 'unknown',
      retrievalConfidence: retrievalResult?.confidence || 0.0,
      sources: retrievalResult?.sources || [],
      dataQualityWarnings: retrievalResult?.dataQualityWarnings || [],

      // Data completeness indicators
      hasStructuredData: !!retrievalResult?.structuredData,
      hasSemanticResults: (retrievalResult?.semanticResults?.length || 0) > 0,
      semanticResultCount: retrievalResult?.semanticResults?.length || 0,
    }

    return NextResponse.json({
      message: response,
      metadata,
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
