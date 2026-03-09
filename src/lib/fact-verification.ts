// Fact Verification Utilities
// Helps verify quantitative claims and detect data conflicts

import { PrismaClient } from '@prisma/client'
import { prisma } from './db'

// ============================================================================
// QUANTITATIVE FACT VERIFICATION
// ============================================================================

export interface FactVerification {
  claim: string
  verified: boolean
  confidence: 'high' | 'medium' | 'low'
  evidence: string[]
  conflicts: string[]
  dataGaps: string[]
}

/**
 * Verify a quantitative fact against database records
 * Example: "We worked with 15 influencers on Instagram in 2024"
 */
export async function verifyQuantitativeFact(
  brandId: string,
  claim: {
    metric: string        // "influencer_count", "campaign_count", "total_spend"
    value: number         // Expected value
    filters?: {
      platform?: string
      year?: number
      influencerName?: string
      status?: string
    }
  }
): Promise<FactVerification> {
  const evidence: string[] = []
  const conflicts: string[] = []
  const dataGaps: string[] = []

  try {
    // Build query based on metric
    switch (claim.metric) {
      case 'influencer_count': {
        const uniqueInfluencers = await prisma.campaignRecord.findMany({
          where: {
            brandId,
            ...(claim.filters?.platform && { platform: claim.filters.platform }),
            ...(claim.filters?.year && { year: claim.filters.year }),
          },
          select: { influencerName: true },
          distinct: ['influencerName'],
        })

        const actualCount = uniqueInfluencers.filter(i => i.influencerName).length
        const verified = actualCount === claim.value

        evidence.push(`Database shows ${actualCount} unique influencers matching criteria`)

        if (!verified) {
          conflicts.push(`Claimed ${claim.value} influencers, database shows ${actualCount}`)
        }

        if (actualCount === 0) {
          dataGaps.push('No campaign records found matching the specified criteria')
        }

        return {
          claim: `${claim.value} influencers`,
          verified,
          confidence: verified ? 'high' : actualCount > 0 ? 'medium' : 'low',
          evidence,
          conflicts,
          dataGaps,
        }
      }

      case 'campaign_count': {
        const campaigns = await prisma.campaignRecord.count({
          where: {
            brandId,
            ...(claim.filters?.platform && { platform: claim.filters.platform }),
            ...(claim.filters?.year && { year: claim.filters.year }),
            ...(claim.filters?.influencerName && {
              influencerName: { contains: claim.filters.influencerName }
            }),
            ...(claim.filters?.status && { status: claim.filters.status }),
          },
        })

        const verified = campaigns === claim.value

        evidence.push(`Database shows ${campaigns} campaigns matching criteria`)

        if (!verified) {
          conflicts.push(`Claimed ${claim.value} campaigns, database shows ${campaigns}`)
        }

        return {
          claim: `${claim.value} campaigns`,
          verified,
          confidence: verified ? 'high' : campaigns > 0 ? 'medium' : 'low',
          evidence,
          conflicts,
          dataGaps,
        }
      }

      default: {
        dataGaps.push(`Verification not implemented for metric: ${claim.metric}`)
        return {
          claim: `${claim.metric} = ${claim.value}`,
          verified: false,
          confidence: 'low',
          evidence,
          conflicts,
          dataGaps,
        }
      }
    }
  } catch (error) {
    console.error('Fact verification error:', error)
    return {
      claim: `${claim.metric} = ${claim.value}`,
      verified: false,
      confidence: 'low',
      evidence: [],
      conflicts: [],
      dataGaps: ['Verification failed due to database error'],
    }
  }
}

// ============================================================================
// CONFLICT DETECTION
// ============================================================================

export interface DataConflict {
  conflictType: string    // "duplicate", "inconsistent_values", "missing_link"
  severity: 'low' | 'medium' | 'high'
  description: string
  affectedEntities: Array<{ type: string; id: string; name?: string }>
  suggestedResolution?: string
}

/**
 * Detect conflicts and inconsistencies in brand data
 */
export async function detectConflicts(brandId: string): Promise<DataConflict[]> {
  const conflicts: DataConflict[] = []

  try {
    // Check for duplicate influencer names with different platforms
    const influencers = await prisma.brandInfluencer.findMany({
      where: { brandId },
      select: { id: true, name: true, platform: true },
    })

    const nameMap = new Map<string, Array<{ id: string; platform: string | null }>>()
    for (const inf of influencers) {
      const key = inf.name.toLowerCase().trim()
      if (!nameMap.has(key)) {
        nameMap.set(key, [])
      }
      nameMap.get(key)!.push({ id: inf.id, platform: inf.platform })
    }

    for (const [name, records] of Array.from(nameMap.entries())) {
      if (records.length > 1) {
        const platforms = new Set(records.map((r: { id: string; platform: string | null }) => r.platform))
        if (platforms.size > 1) {
          conflicts.push({
            conflictType: 'duplicate',
            severity: 'medium',
            description: `Influencer "${name}" appears with different platforms: ${Array.from(platforms).join(', ')}`,
            affectedEntities: records.map((r: { id: string; platform: string | null }) => ({ type: 'influencer', id: r.id, name })),
            suggestedResolution: 'Merge duplicate influencer records or verify platform assignments',
          })
        }
      }
    }

    // Check for campaigns with influencers not in the roster
    const campaigns = await prisma.campaignRecord.findMany({
      where: { brandId },
      select: { id: true, influencerName: true },
    })

    const rosterNames = new Set(influencers.map(i => i.name.toLowerCase().trim()))

    for (const campaign of campaigns) {
      if (campaign.influencerName) {
        const normalized = campaign.influencerName.toLowerCase().trim()
        if (!rosterNames.has(normalized)) {
          conflicts.push({
            conflictType: 'missing_link',
            severity: 'low',
            description: `Campaign references influencer "${campaign.influencerName}" who is not in the roster`,
            affectedEntities: [
              { type: 'campaign', id: campaign.id },
            ],
            suggestedResolution: 'Re-run influencer roster build to sync',
          })
        }
      }
    }

    // Check for insights with non-existent influencers
    const insights = await prisma.campaignInsight.findMany({
      where: { brandId },
      select: { id: true, influencerName: true },
    })

    for (const insight of insights) {
      if (insight.influencerName) {
        const normalized = insight.influencerName.toLowerCase().trim()
        if (!rosterNames.has(normalized)) {
          conflicts.push({
            conflictType: 'missing_link',
            severity: 'low',
            description: `Insight references influencer "${insight.influencerName}" who is not in the roster`,
            affectedEntities: [
              { type: 'insight', id: insight.id },
            ],
            suggestedResolution: 'Review insight or add influencer to roster',
          })
        }
      }
    }

  } catch (error) {
    console.error('Conflict detection error:', error)
  }

  return conflicts
}

// ============================================================================
// SOURCE REFERENCE UTILITIES
// ============================================================================

export interface SourceReference {
  sourceType: string      // "campaign_record", "insight", "trend", "brand_intelligence"
  sourceId: string
  sourceName?: string
  data: any               // The actual source data
  confidence: string
}

/**
 * Get source references for a claim or insight
 */
export async function getSourceReferences(
  brandId: string,
  query: {
    influencerName?: string
    campaignName?: string
    platform?: string
    year?: number
    category?: string       // For insights/learnings
  }
): Promise<SourceReference[]> {
  const references: SourceReference[] = []

  try {
    // Get campaign records matching query
    const campaigns = await prisma.campaignRecord.findMany({
      where: {
        brandId,
        ...(query.influencerName && {
          influencerName: { contains: query.influencerName }
        }),
        ...(query.campaignName && {
          campaignName: { contains: query.campaignName }
        }),
        ...(query.platform && { platform: query.platform }),
        ...(query.year && { year: query.year }),
      },
      take: 20,
    })

    for (const campaign of campaigns) {
      references.push({
        sourceType: 'campaign_record',
        sourceId: campaign.id,
        sourceName: `${campaign.influencerName || 'Unknown'} - ${campaign.campaignName || 'Unnamed'}`,
        data: campaign,
        confidence: 'high', // Direct data is high confidence
      })
    }

    // Get insights matching query
    if (query.category || query.influencerName || query.campaignName) {
      const insights = await prisma.campaignInsight.findMany({
        where: {
          brandId,
          ...(query.category && { category: query.category }),
          ...(query.influencerName && {
            influencerName: { contains: query.influencerName }
          }),
          ...(query.campaignName && {
            campaignName: { contains: query.campaignName }
          }),
          ...(query.platform && { platform: query.platform }),
          ...(query.year && { year: query.year }),
        },
        take: 10,
      })

      for (const insight of insights) {
        references.push({
          sourceType: 'insight',
          sourceId: insight.id,
          sourceName: insight.title,
          data: insight,
          confidence: insight.confidence,
        })
      }
    }

    // Get trends matching query
    if (query.platform || query.year) {
      const trends = await prisma.trendAnalysis.findMany({
        where: {
          brandId,
          status: 'active',
          ...(query.platform && {
            platforms: { contains: query.platform }
          }),
        },
        take: 5,
      })

      for (const trend of trends) {
        references.push({
          sourceType: 'trend',
          sourceId: trend.id,
          sourceName: trend.title,
          data: trend,
          confidence: trend.confidence,
        })
      }
    }

  } catch (error) {
    console.error('Source reference lookup error:', error)
  }

  return references
}

// ============================================================================
// AUTO-FLAGGING UTILITY
// ============================================================================

/**
 * Automatically create data quality flags for detected issues
 */
export async function autoFlagDataQualityIssues(brandId: string): Promise<number> {
  const conflicts = await detectConflicts(brandId)
  let flagsCreated = 0

  for (const conflict of conflicts) {
    for (const entity of conflict.affectedEntities) {
      try {
        await prisma.dataQualityFlag.upsert({
          where: {
            brandId_entityType_entityId_issueType: {
              brandId,
              entityType: entity.type,
              entityId: entity.id,
              issueType: conflict.conflictType,
            },
          },
          create: {
            brandId,
            entityType: entity.type,
            entityId: entity.id,
            issueType: conflict.conflictType,
            severity: conflict.severity,
            description: conflict.description,
            status: 'open',
          },
          update: {
            severity: conflict.severity,
            description: conflict.description,
            status: 'open', // Re-open if was previously dismissed
          },
        })
        flagsCreated++
      } catch (error) {
        console.error(`Failed to create flag for ${entity.type} ${entity.id}:`, error)
      }
    }
  }

  console.log(`✅ Created/updated ${flagsCreated} data quality flags`)
  return flagsCreated
}
