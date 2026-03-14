// Campaign Sync Orchestrator
// Handles multi-tab sync for campaign trackers with AI extraction

import { PrismaClient } from '@prisma/client'
import {
  extractSpreadsheetId,
  discoverAllTabs,
  fetchAllTabs,
  TabInfo,
} from './google-sheets-public'
import {
  extractCampaignRecords,
  extractSOWRecords,
  buildInfluencerRoster,
  generateBrandIntelligence,
  parseValueToCents,
} from './campaign-extractor'
import {
  extractCampaignInsights,
  extractInfluencerNotes,
  detectTrends,
  generateStrategicRecommendations,
} from './qualitative-extractor'
import {
  updateSyncProgress,
  resetSyncProgress,
  completeSyncProgress,
} from './sync-progress'

// ============================================================================
// BATCH PROCESSING HELPERS - Prevent database/memory issues with large datasets
// ============================================================================

const BATCH_SIZE = 500 // Records per database write

/**
 * Chunked createMany to prevent database statement size limits
 * Splits large arrays into smaller batches for reliable writes
 */
async function batchCreateMany<T>(
  prisma: PrismaClient,
  model: 'campaignRecord' | 'campaignInsight',
  data: T[],
  onProgress?: (processed: number, total: number) => void
): Promise<number> {
  if (data.length === 0) return 0

  let totalCreated = 0

  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE)

    if (model === 'campaignRecord') {
      await (prisma.campaignRecord as any).createMany({ data: batch })
    } else if (model === 'campaignInsight') {
      await (prisma.campaignInsight as any).createMany({ data: batch })
    }

    totalCreated += batch.length

    if (onProgress) {
      onProgress(totalCreated, data.length)
    }
  }

  return totalCreated
}

// ============================================================================
// TAB ROUTING - Process all useful tabs, skip only truly irrelevant ones
// ============================================================================

// Data types that can be extracted from tabs
type TabDataType = 'campaigns' | 'contracts' | 'influencers' | 'skip'

// EXCLUDED TABS - Only skip tabs that contain NO useful campaign/creator data
// These are structural/utility tabs that have no content worth extracting
const EXCLUDED_TABS = [
  'template', 'archive', 'old version', 'copy of', 'do not use',
  'instructions', 'readme', 'help', 'backup',
  'dont use', "don't use", 'ignore', 'deprecated', 'unused',
  'change log', 'changelog',
]

// EXPLICIT MAPPINGS - Named tab types that should route to specific extractors
const TAB_MAPPINGS: Array<{ patterns: string[], dataType: TabDataType }> = [
  // Contracts / SOW tabs
  { patterns: ['contracts', 'sow', 'scope of work', 'agreement', 'deal memo'], dataType: 'contracts' },

  // Influencer roster tabs
  { patterns: ['sow review', 'influencer roster', 'creator roster', 'talent list'], dataType: 'influencers' },

  // All other tabs default to 'campaigns' — the extraction AI can read any structure
]

// Determine what type of data a tab contains
function getTabDataType(tabName: string): TabDataType {
  const normalized = tabName.trim().toLowerCase()

  // Check exclusions first — skip only genuinely irrelevant tabs
  if (EXCLUDED_TABS.some(pattern => normalized.includes(pattern))) {
    return 'skip'
  }

  // Check explicit mappings
  for (const mapping of TAB_MAPPINGS) {
    if (mapping.patterns.some(pattern => normalized.includes(pattern))) {
      return mapping.dataType
    }
  }

  // DEFAULT: Process ALL other tabs as campaigns
  // This includes: Campaign Tracker, Dashboard, Paid Usage, Paid Media Report,
  // Paid Extensions, Ad Repository, Performance, Analytics, Results, etc.
  // The extraction AI will read whatever structure it finds.
  return 'campaigns'
}

// Check if tab should be processed
function shouldProcessTab(tabName: string): boolean {
  return getTabDataType(tabName) !== 'skip'
}

// Detect if a tab is a contracts tab (for SOW/contract extraction)
function isContractsTab(tabName: string): boolean {
  return getTabDataType(tabName) === 'contracts'
}

// Detect if a tab is an influencers tab (SOW Review for influencer roster)
function isInfluencersTab(tabName: string): boolean {
  return getTabDataType(tabName) === 'influencers'
}

// Extract platform hint from SOW tab name (e.g., "SOW Review Tab IG" -> "Instagram")
function extractSOWPlatform(tabName: string): string | null {
  const normalized = tabName.toLowerCase().trim()
  const platformSuffixes: Record<string, string> = {
    'ig': 'Instagram',
    'instagram': 'Instagram',
    'tt': 'TikTok',
    'tiktok': 'TikTok',
    'yt': 'YouTube',
    'youtube': 'YouTube',
    'tw': 'Twitter',
    'twitter': 'Twitter',
    'x': 'Twitter',
    'fb': 'Facebook',
    'facebook': 'Facebook',
  }
  for (const [suffix, platform] of Object.entries(platformSuffixes)) {
    if (normalized.endsWith(suffix) || normalized.endsWith(` ${suffix}`) || normalized.includes(` ${suffix} `)) {
      return platform
    }
  }
  return null
}

interface SyncResult {
  success: boolean
  tabCount: number
  rowCount: number
  recordsExtracted: number
  influencersFound: number
  error?: string
}

// ============================================================================
// CONCURRENCY HELPER - Run async tasks with a max parallelism limit
// Avoids hammering the AI API while still processing multiple tabs at once
// ============================================================================
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < tasks.length) {
      const i = nextIndex++
      results[i] = await tasks[i]()
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker))
  return results
}

// Sync a single campaign tracker (all tabs)
export async function syncCampaignTracker(
  trackerId: string,
  prisma: PrismaClient
): Promise<SyncResult> {
  // Load the tracker
  const tracker = await prisma.campaignTracker.findUnique({
    where: { id: trackerId },
    include: { brand: true },
  })

  if (!tracker) {
    throw new Error('Campaign tracker not found')
  }

  // Mark as syncing
  await prisma.campaignTracker.update({
    where: { id: trackerId },
    data: { syncStatus: 'syncing', errorMessage: null },
  })

  try {
    // Discover all tabs
    const tabs = await discoverAllTabs(tracker.spreadsheetId)
    console.log(`Discovered ${tabs.length} tabs for tracker ${tracker.label || tracker.id}`)

    // Fetch data from all tabs
    const tabData = await fetchAllTabs(tracker.spreadsheetId, tabs)

    let totalRows = 0
    let totalRecords = 0

    // Compute processable tabs
    const processableTabs = tabData.filter(t => shouldProcessTab(t.tabName))

    // ── PHASE 1: Store all tab data to DB (fast, sequential) ─────────────────
    // Upsert TrackerTab records and count rows before starting AI extraction.
    // This ensures raw data is always persisted even if AI extraction fails.
    await updateSyncProgress(
      prisma,
      tracker.brandId,
      'processing_tabs',
      `Saving ${processableTabs.length} tabs...`
    )

    for (const tab of tabData) {
      if (!shouldProcessTab(tab.tabName)) {
        console.log(`⏭️  Skipping tab "${tab.tabName}" (excluded: template/archive/backup)`)
        continue
      }

      await prisma.trackerTab.upsert({
        where: { trackerId_gid: { trackerId, gid: tab.gid } },
        create: {
          trackerId,
          gid: tab.gid,
          tabName: tab.tabName,
          tabIndex: tab.tabIndex,
          rowCount: tab.rows.length,
          headers: JSON.stringify(tab.headers),
          rawData: JSON.stringify(tab.rows.map(r => r.data)),
          syncedAt: new Date(),
        },
        update: {
          tabName: tab.tabName,
          tabIndex: tab.tabIndex,
          rowCount: tab.rows.length,
          headers: JSON.stringify(tab.headers),
          rawData: JSON.stringify(tab.rows.map(r => r.data)),
          syncedAt: new Date(),
        },
      })

      totalRows += tab.rows.length
    }

    // ── PHASE 2: AI extraction — run 3 tabs in parallel ──────────────────────
    // Each tab calls Claude to extract structured records. Running 3 at once
    // cuts total extraction time by ~3x vs sequential.
    console.log(`\n🚀 Extracting records from ${processableTabs.length} tabs (3 in parallel)...`)
    let completedTabs = 0

    const extractionTasks = processableTabs
      .filter(tab => tab.rows.length > 0 && tab.headers.length > 0)
      .map(tab => async (): Promise<number> => {
        const tabDataType = getTabDataType(tab.tabName)
        console.log(`📋 Processing tab "${tab.tabName}" as: ${tabDataType}`)
        let tabRecords = 0

        try {
          if (tabDataType === 'contracts') {
            console.log(`  📄 Extracting contracts from: ${tab.tabName}`)
            const platformHint = extractSOWPlatform(tab.tabName)

            const sowRecords = await extractSOWRecords(
              tracker.brand.name,
              tab.tabName,
              tab.headers,
              tab.rows.map(r => r.data),
              tracker.year || undefined,
              platformHint || undefined
            )

            if (sowRecords.length > 0) {
              const sowData = sowRecords.map((record) => ({
                brandId: tracker.brandId,
                trackerId,
                influencerName: record.influencerName || null,
                handle: record.handle || null,
                campaignName: record.campaignName || null,
                platform: record.platform || platformHint || null,
                contentType: null,
                dealValue: record.dealValue || null,
                status: record.status || null,
                year: tracker.year || null,
                quarter: null,
                tabName: tab.tabName,
                rawData: JSON.stringify(record.rawData || {}),
                recordType: 'sow',
                contractType: record.contractType || null,
                deliverables: record.deliverables ? JSON.stringify(record.deliverables) : null,
                paymentTerms: record.paymentTerms || null,
                usageRights: record.usageRights || null,
                exclusivity: record.exclusivity || null,
                contractStart: record.startDate || null,
                contractEnd: record.endDate || null,
                totalValue: parseValueToCents(record.dealValue),
              }))
              await batchCreateMany(prisma, 'campaignRecord', sowData)
              tabRecords = sowRecords.length
              console.log(`  ✅ Extracted ${sowRecords.length} contracts from "${tab.tabName}"`)
            }

          } else if (tabDataType === 'influencers') {
            console.log(`  👥 SOW Review tab "${tab.tabName}" — raw data already stored`)

          } else if (tabDataType === 'campaigns') {
            console.log(`  📊 Extracting campaigns from: ${tab.tabName}`)
            const records = await extractCampaignRecords(
              tracker.brand.name,
              tab.tabName,
              tab.headers,
              tab.rows.map(r => r.data),
              tracker.year || undefined
            )

            if (records.length > 0) {
              const campaignData = records.map((record) => ({
                brandId: tracker.brandId,
                trackerId,
                influencerName: record.influencerName || null,
                handle: record.handle || null,
                campaignName: record.campaignName || null,
                platform: record.platform || null,
                contentType: record.contentType || null,
                dealValue: record.dealValue || null,
                status: record.status || null,
                year: tracker.year || null,
                quarter: record.quarter || null,
                tabName: tab.tabName,
                rawData: JSON.stringify(record.rawData || {}),
                recordType: 'campaign',
              }))
              await batchCreateMany(prisma, 'campaignRecord', campaignData)
              tabRecords = records.length
              console.log(`  ✅ Extracted ${records.length} campaigns from "${tab.tabName}"`)
            }
          }
        } catch (error) {
          console.error(`  ❌ Extraction failed for tab "${tab.tabName}":`, error)
          // Continue — other tabs should still complete
        }

        // Update progress after each tab completes
        completedTabs++
        await updateSyncProgress(
          prisma,
          tracker.brandId,
          'processing_tabs',
          `"${tab.tabName}" (${completedTabs} of ${processableTabs.length} done)`
        )

        return tabRecords
      })

    const tabRecordCounts = await runConcurrent(extractionTasks, 3)
    totalRecords = tabRecordCounts.reduce((sum, n) => sum + n, 0)

    // LOG: Sync summary
    console.log(`\n=== SYNC SUMMARY: ${tracker.label || tracker.id} ===`)
    console.log(`Tabs processed: ${tabData.length}`)
    console.log(`Total rows found: ${totalRows}`)
    console.log(`Records extracted: ${totalRecords}`)
    if (totalRecords === 0 && totalRows > 0) {
      console.log(`⚠️  WARNING: Found ${totalRows} rows but extracted 0 records`)
      console.log(`   This likely means AI determined tabs don't contain campaign data`)
      console.log(`   Check logs above for per-tab extraction details`)
    }
    console.log(`===================\n`)

    // Build influencer roster from all campaign records for this brand
    const influencersFound = await buildInfluencerRoster(tracker.brandId, prisma)

    // Generate brand intelligence summary
    await generateBrandIntelligence(tracker.brandId, prisma)

    // === QUALITATIVE INTELLIGENCE EXTRACTION (parallel, 3 at a time) ===
    console.log('\n=== EXTRACTING QUALITATIVE INSIGHTS (parallel) ===')
    let totalInsights = 0

    const insightTabs = tabData.filter(t => shouldProcessTab(t.tabName) && t.rows.length > 0)
    const insightTasks = insightTabs.map(tab => async (): Promise<number> => {
      try {
        const insights = await extractCampaignInsights(
          tracker.brand.name,
          tab.tabName,
          tab.headers,
          tab.rows.map(r => r.data),
          tracker.year || undefined
        )

        if (insights.length > 0) {
          await prisma.campaignInsight.createMany({
            data: insights.map((insight) => ({
              brandId: tracker.brandId,
              trackerId,
              category: insight.category,
              sentiment: insight.sentiment,
              title: insight.title,
              description: insight.description,
              sourceType: insight.sourceType,
              sourceRef: JSON.stringify({ tab: tab.tabName, gid: tab.gid }),
              confidence: insight.confidence,
              influencerName: insight.influencerName || null,
              campaignName: insight.campaignName || null,
              platform: insight.platform || null,
              year: insight.year || tracker.year || null,
              quarter: insight.quarter || null,
            })),
          })
          console.log(`  ✅ Stored ${insights.length} insights from "${tab.tabName}"`)
          return insights.length
        }
      } catch (error) {
        console.error(`  ❌ Failed to extract insights from "${tab.tabName}":`, error)
      }
      return 0
    })

    const insightCounts = await runConcurrent(insightTasks, 3)
    totalInsights = insightCounts.reduce((sum, n) => sum + n, 0)

    console.log(`Total insights extracted: ${totalInsights}`)

    // === INFLUENCER PERFORMANCE NOTES ===
    console.log('\n=== EXTRACTING INFLUENCER NOTES ===')
    try {
      const notes = await extractInfluencerNotes(tracker.brandId, prisma)

      if (notes.length > 0) {
        // Store notes linked to influencers
        for (const note of notes) {
          // Find the influencer record
          const influencer = await prisma.brandInfluencer.findUnique({
            where: {
              brandId_name: { brandId: tracker.brandId, name: note.influencerName },
            },
          })

          if (influencer) {
            await prisma.influencerNote.create({
              data: {
                brandId: tracker.brandId,
                influencerId: influencer.id,
                noteType: note.noteType,
                sentiment: note.sentiment,
                content: note.content,
                sourceType: note.sourceType,
                confidence: note.confidence,
                year: note.year || null,
              },
            })
          }
        }
        console.log(`  ✅ Stored ${notes.length} influencer notes`)
      }
    } catch (error) {
      console.error(`  ❌ Failed to extract influencer notes:`, error)
    }

    // Update tracker sync status
    await prisma.campaignTracker.update({
      where: { id: trackerId },
      data: {
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    })

    // Update brand aggregate sync status
    await updateBrandSyncStatus(tracker.brandId, prisma)

    return {
      success: true,
      tabCount: tabData.length,
      rowCount: totalRows,
      recordsExtracted: totalRecords,
      influencersFound,
    }
  } catch (error: any) {
    console.error(`Failed to sync tracker ${trackerId}:`, error)

    // Mark as error
    await prisma.campaignTracker.update({
      where: { id: trackerId },
      data: {
        syncStatus: 'error',
        errorMessage: error.message || 'Unknown error',
      },
    })

    // Update brand sync status to reflect error
    await updateBrandSyncStatus(tracker.brandId, prisma)

    return {
      success: false,
      tabCount: 0,
      rowCount: 0,
      recordsExtracted: 0,
      influencersFound: 0,
      error: error.message,
    }
  }
}

// Sync all campaign trackers for a brand
export async function syncAllBrandTrackers(
  brandId: string,
  prisma: PrismaClient
): Promise<{
  results: Array<{ trackerId: string; label: string | null } & SyncResult>
  totalTabs: number
  totalRows: number
  totalRecords: number
  totalInfluencers: number
}> {
  // Mark brand as syncing and reset progress
  await prisma.brand.update({
    where: { id: brandId },
    data: { syncStatus: 'syncing' },
  })
  await resetSyncProgress(prisma, brandId)

  // Get all trackers for this brand
  await updateSyncProgress(prisma, brandId, 'discovering_tabs')
  const trackers = await prisma.campaignTracker.findMany({
    where: { brandId },
  })

  if (trackers.length === 0) {
    await prisma.brand.update({
      where: { id: brandId },
      data: { syncStatus: 'synced', lastSyncedAt: new Date() },
    })
    return {
      results: [],
      totalTabs: 0,
      totalRows: 0,
      totalRecords: 0,
      totalInfluencers: 0,
    }
  }

  // Clear existing campaign records for this brand before syncing
  // (to avoid duplicates across syncs)
  await prisma.campaignRecord.deleteMany({
    where: { brandId },
  })

  // Sync each tracker
  const results: Array<{ trackerId: string; label: string | null } & SyncResult> = []

  await updateSyncProgress(prisma, brandId, 'fetching_data', `${trackers.length} tracker(s)`)

  for (let i = 0; i < trackers.length; i++) {
    const tracker = trackers[i]
    await updateSyncProgress(prisma, brandId, 'processing_tabs', `${tracker.label || 'Tracker'} (${i + 1} of ${trackers.length})`)
    const result = await syncCampaignTracker(tracker.id, prisma)
    results.push({
      trackerId: tracker.id,
      label: tracker.label,
      ...result,
    })
  }

  // After all trackers synced, continue with extraction phases
  await updateSyncProgress(prisma, brandId, 'extracting_campaigns')
  await updateSyncProgress(prisma, brandId, 'building_roster')

  // Calculate totals
  const totalTabs = results.reduce((sum, r) => sum + r.tabCount, 0)
  const totalRows = results.reduce((sum, r) => sum + r.rowCount, 0)
  const totalRecords = results.reduce((sum, r) => sum + r.recordsExtracted, 0)

  // Get final influencer count
  const totalInfluencers = await prisma.brandInfluencer.count({
    where: { brandId },
  })

  return {
    results,
    totalTabs,
    totalRows,
    totalRecords,
    totalInfluencers,
  }
}

// Update brand's aggregate sync status based on all trackers
async function updateBrandSyncStatus(brandId: string, prisma: PrismaClient) {
  const trackers = await prisma.campaignTracker.findMany({
    where: { brandId },
    select: { syncStatus: true, lastSyncedAt: true },
  })

  if (trackers.length === 0) {
    await prisma.brand.update({
      where: { id: brandId },
      data: { syncStatus: 'pending' },
    })
    return
  }

  // Check if any are still syncing
  if (trackers.some((t) => t.syncStatus === 'syncing')) {
    await prisma.brand.update({
      where: { id: brandId },
      data: { syncStatus: 'syncing' },
    })
    return
  }

  // Check if any have errors
  if (trackers.some((t) => t.syncStatus === 'error')) {
    await prisma.brand.update({
      where: { id: brandId },
      data: { syncStatus: 'error' },
    })
    return
  }

  // Check if all are synced
  if (trackers.every((t) => t.syncStatus === 'synced')) {
    // Use most recent sync time
    const lastSyncedAt = trackers.reduce((latest, t) => {
      if (!t.lastSyncedAt) return latest
      if (!latest) return t.lastSyncedAt
      return t.lastSyncedAt > latest ? t.lastSyncedAt : latest
    }, null as Date | null)

    await prisma.brand.update({
      where: { id: brandId },
      data: {
        syncStatus: 'synced',
        lastSyncedAt: lastSyncedAt || new Date(),
      },
    })

    // === ADVANCED ANALYSIS (when all trackers synced) ===
    console.log('\n=== ALL TRACKERS SYNCED: RUNNING ADVANCED ANALYSIS ===')
    const analysisStartTime = Date.now()

    // Clear old trends before generating new ones
    await prisma.trendAnalysis.updateMany({
      where: { brandId },
      data: { status: 'historical' },
    })

    // Import qualitative extractor for learnings
    const { generateBrandLearnings } = await import('./qualitative-extractor')

    // Update progress to show analysis starting
    await updateSyncProgress(prisma, brandId, 'detecting_trends', 'Analyzing patterns...')

    // === PHASE 1: Run trends and recommendations in parallel ===
    // These don't depend on each other, so run simultaneously
    console.log('[Sync] Phase 1: Starting parallel AI analysis (trends, recommendations)...')
    const phase1StartTime = Date.now()

    const [trendsResult, recommendationsResult] = await Promise.allSettled([
      detectTrends(brandId, prisma),
      generateStrategicRecommendations(brandId, prisma),
    ])

    console.log(`[Sync] Phase 1 completed in ${Date.now() - phase1StartTime}ms`)

    // Process and SAVE trends result (must be in DB before learnings)
    if (trendsResult.status === 'fulfilled' && trendsResult.value.length > 0) {
      const trends = trendsResult.value
      await prisma.trendAnalysis.createMany({
        data: trends.map((trend) => ({
          brandId,
          trendType: trend.trendType,
          metric: trend.metric,
          direction: trend.direction,
          title: trend.title,
          description: trend.description,
          dataPoints: JSON.stringify({}),
          magnitude: trend.magnitude || null,
          confidence: trend.confidence,
          timeframe: trend.timeframe,
          platforms: trend.platforms ? JSON.stringify(trend.platforms) : null,
          influencers: trend.influencers ? JSON.stringify(trend.influencers) : null,
          status: 'active',
        })),
      })
      console.log(`[Sync] Detected ${trends.length} trends`)
    } else if (trendsResult.status === 'rejected') {
      console.error(`[Sync] Trend detection failed:`, trendsResult.reason)
    }

    // Process recommendations result
    await updateSyncProgress(prisma, brandId, 'generating_recommendations')
    if (recommendationsResult.status === 'fulfilled' && recommendationsResult.value.length > 0) {
      const recommendations = recommendationsResult.value
      // Clear old pending recommendations
      await prisma.strategicRecommendation.deleteMany({
        where: { brandId, status: 'pending' },
      })

      await prisma.strategicRecommendation.createMany({
        data: recommendations.map((rec) => ({
          brandId,
          category: rec.category,
          priority: rec.priority,
          title: rec.title,
          recommendation: rec.recommendation,
          rationale: rec.rationale,
          basedOn: JSON.stringify({ trends: true, learnings: true }),
          confidence: rec.confidence,
          expectedImpact: rec.expectedImpact || null,
          effort: rec.effort || null,
          timeframe: rec.timeframe || null,
          status: 'pending',
        })),
      })
      console.log(`[Sync] Generated ${recommendations.length} strategic recommendations`)
    } else if (recommendationsResult.status === 'rejected') {
      console.error(`[Sync] Recommendation generation failed:`, recommendationsResult.reason)
    }

    // === PHASE 2: Generate learnings AFTER trends are saved ===
    // Learnings need trends in the database to include them in the analysis
    await updateSyncProgress(prisma, brandId, 'generating_learnings', 'Synthesizing learnings...')
    console.log('[Sync] Phase 2: Generating learnings (with trends now in DB)...')
    const phase2StartTime = Date.now()

    try {
      const learningsCount = await generateBrandLearnings(brandId, prisma)
      console.log(`[Sync] Phase 2 completed in ${Date.now() - phase2StartTime}ms`)
      if (learningsCount > 0) {
        console.log(`[Sync] Generated ${learningsCount} brand learnings`)
      } else {
        console.log(`[Sync] No learnings generated (check data sources)`)
      }
    } catch (error) {
      console.error(`[Sync] Brand learnings generation failed:`, error)
    }

    // Generate/update knowledge base structure (runs after learnings complete)
    await updateSyncProgress(prisma, brandId, 'building_knowledge')
    try {
      const { generateKnowledgeStructure } = await import('./knowledge-generator')
      const result = await generateKnowledgeStructure(brandId, prisma)
      console.log(`[Sync] Knowledge base updated: ${result.foldersCreated} folders, ${result.documentsCreated} documents`)
    } catch (error) {
      console.error(`[Sync] Knowledge base generation failed:`, error)
    }

    // Mark sync as complete
    await updateSyncProgress(prisma, brandId, 'finalizing')
    await completeSyncProgress(prisma, brandId)

    console.log(`=== ADVANCED ANALYSIS COMPLETE (${Date.now() - analysisStartTime}ms total) ===\n`)

    return
  }

  // Some pending
  await prisma.brand.update({
    where: { id: brandId },
    data: { syncStatus: 'pending' },
  })
}

// Add a new campaign tracker to a brand
export async function addCampaignTracker(
  brandId: string,
  spreadsheetUrl: string,
  label: string | null,
  year: number | null,
  prisma: PrismaClient,
  selectedTabs?: string[] // Array of GIDs to sync (null = all tabs)
) {
  const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)

  if (!spreadsheetId) {
    throw new Error('Invalid Google Sheets URL')
  }

  // Check if already exists
  const existing = await prisma.campaignTracker.findUnique({
    where: {
      brandId_spreadsheetId: { brandId, spreadsheetId },
    },
  })

  if (existing) {
    throw new Error('This spreadsheet is already connected to this brand')
  }

  // Create the tracker
  const tracker = await prisma.campaignTracker.create({
    data: {
      brandId,
      spreadsheetUrl,
      spreadsheetId,
      label,
      year,
      syncStatus: 'pending',
      selectedTabs: selectedTabs ? JSON.stringify(selectedTabs) : null,
    },
  })

  return tracker
}
