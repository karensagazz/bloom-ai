import { NextResponse } from 'next/server'
import { waitUntil } from '@vercel/functions'
import { syncBrandPublicSheet } from '@/lib/google-sheets-public'
import { syncBrandSlackChannel } from '@/lib/slack-client'
import { syncAllBrandTrackers } from '@/lib/campaign-sync'
import { resetSyncProgress } from '@/lib/sync-progress'
import { prisma } from '@/lib/db'

// Increase function timeout — allows background work to run up to 5 min after response
export const maxDuration = 300 // 5 minutes (Vercel Pro)

// POST /api/brands/[id]/sync - Trigger sync for a brand
// Returns immediately with { status: 'syncing' } and runs the full sync in the background.
// The frontend polls /api/brands/[id]/sync-progress for live updates.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: brandId } = await params
  console.log(`[Sync] Received sync request for brand ${brandId}`)

  // Validate the brand exists before kicking off background work
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    include: { _count: { select: { campaignTrackers: true } } },
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  // Mark as syncing immediately so the UI updates right away
  await prisma.brand.update({
    where: { id: brandId },
    data: { syncStatus: 'syncing' },
  })
  await resetSyncProgress(prisma, brandId)

  // ── BACKGROUND SYNC ────────────────────────────────────────────────────────
  // waitUntil keeps the Vercel function alive after the HTTP response is sent.
  // The client gets an instant acknowledgement; sync runs fully in the background.
  // Progress is written to the DB and polled by the frontend every second.
  // ──────────────────────────────────────────────────────────────────────────
  waitUntil(
    (async () => {
      const startTime = Date.now()
      console.log(`[Sync BG] Starting background sync for brand ${brandId}`)

      try {
        // Sync campaign trackers
        if (brand._count.campaignTrackers > 0) {
          await syncAllBrandTrackers(brandId, prisma)
        }

        // Legacy spreadsheet sync (brands without trackers)
        if (brand.spreadsheetId && brand._count.campaignTrackers === 0) {
          try {
            await syncBrandPublicSheet(brandId, prisma)
          } catch (err) {
            console.error('[Sync BG] Legacy spreadsheet sync failed:', err)
          }
        }

        // Sync Slack channel if connected
        if (brand.slackChannelId) {
          try {
            await syncBrandSlackChannel(brandId)
          } catch (err) {
            console.error('[Sync BG] Slack sync failed:', err)
          }
        }

        console.log(`[Sync BG] Completed in ${Date.now() - startTime}ms`)
      } catch (error: any) {
        console.error(`[Sync BG] Failed after ${Date.now() - startTime}ms:`, error)

        // Mark as error so the UI shows the failure state
        await prisma.brand.update({
          where: { id: brandId },
          data: { syncStatus: 'error' },
        }).catch(() => {}) // swallow — DB might be unavailable
      }
    })()
  )

  // Return immediately — frontend will poll /sync-progress for updates
  return NextResponse.json({
    status: 'syncing',
    message: 'Sync started in background. Poll /sync-progress for updates.',
  })
}
