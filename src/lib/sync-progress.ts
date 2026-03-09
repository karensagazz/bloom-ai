import { PrismaClient } from '@prisma/client'

// Sync stages with weighted progress (must add up to 100)
const SYNC_STAGES = [
  { id: 1, key: 'discovering_tabs', label: 'Discovering tabs', weight: 5 },
  { id: 2, key: 'fetching_data', label: 'Fetching spreadsheet data', weight: 10 },
  { id: 3, key: 'processing_tabs', label: 'Processing tabs', weight: 15 },
  { id: 4, key: 'extracting_campaigns', label: 'Extracting campaigns', weight: 15 },
  { id: 5, key: 'extracting_contracts', label: 'Extracting contracts', weight: 10 },
  { id: 6, key: 'building_roster', label: 'Building influencer roster', weight: 5 },
  { id: 7, key: 'generating_intelligence', label: 'Generating brand intelligence', weight: 10 },
  { id: 8, key: 'extracting_insights', label: 'Analyzing qualitative data', weight: 8 },
  { id: 9, key: 'extracting_notes', label: 'Extracting influencer notes', weight: 5 },
  { id: 10, key: 'detecting_trends', label: 'Detecting patterns', weight: 5 },
  { id: 11, key: 'generating_recommendations', label: 'Generating recommendations', weight: 4 },
  { id: 12, key: 'generating_learnings', label: 'Generating learnings', weight: 4 },
  { id: 13, key: 'building_knowledge', label: 'Building knowledge base', weight: 2 },
  { id: 14, key: 'finalizing', label: 'Finalizing sync', weight: 2 },
] as const

type SyncStageKey = typeof SYNC_STAGES[number]['key']

/**
 * Calculate cumulative progress up to (and including) the given stage
 */
function calculateProgress(stageKey: SyncStageKey): number {
  const stageIndex = SYNC_STAGES.findIndex(s => s.key === stageKey)
  if (stageIndex === -1) return 0

  let progress = 0
  for (let i = 0; i <= stageIndex; i++) {
    progress += SYNC_STAGES[i].weight
  }
  return progress
}

/**
 * Get the label for a stage
 */
function getStageLabel(stageKey: SyncStageKey): string {
  const stage = SYNC_STAGES.find(s => s.key === stageKey)
  return stage?.label || 'Syncing...'
}

/**
 * Update sync progress for a brand
 */
export async function updateSyncProgress(
  prisma: PrismaClient,
  brandId: string,
  stageKey: SyncStageKey,
  detail?: string
): Promise<void> {
  try {
    const progress = calculateProgress(stageKey)
    const label = getStageLabel(stageKey)
    const step = detail ? `${label}: ${detail}` : `${label}...`

    await prisma.brand.update({
      where: { id: brandId },
      data: {
        syncProgress: progress,
        syncStep: step,
      },
    })

    console.log(`[Sync Progress] ${brandId}: ${progress}% - ${step}`)
  } catch (error) {
    // Don't fail the entire sync if progress update fails
    console.error(`[Sync Progress] Failed to update progress:`, error)
  }
}

/**
 * Reset sync progress when starting a new sync
 */
export async function resetSyncProgress(
  prisma: PrismaClient,
  brandId: string
): Promise<void> {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        syncProgress: 0,
        syncStep: 'Starting sync...',
      },
    })
  } catch (error) {
    console.error(`[Sync Progress] Failed to reset progress:`, error)
  }
}

/**
 * Mark sync as complete
 */
export async function completeSyncProgress(
  prisma: PrismaClient,
  brandId: string
): Promise<void> {
  try {
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        syncProgress: 100,
        syncStep: 'Sync complete',
      },
    })
  } catch (error) {
    console.error(`[Sync Progress] Failed to complete progress:`, error)
  }
}

export { SYNC_STAGES, type SyncStageKey }
