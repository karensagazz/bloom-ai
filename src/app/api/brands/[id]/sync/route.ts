import { NextResponse } from 'next/server'
import { syncBrandPublicSheet } from '@/lib/google-sheets-public'
import { syncBrandSlackChannel } from '@/lib/slack-client'
import { syncAllBrandTrackers } from '@/lib/campaign-sync'
import { prisma } from '@/lib/db'

// POST /api/brands/[id]/sync - Trigger sync for a brand
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const startTime = Date.now()
  console.log(`[Sync] Starting sync for brand ${params.id}`)

  try {
    const brand = await prisma.brand.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { campaignTrackers: true } },
      },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const results: {
      trackers?: {
        success: boolean
        totalTabs?: number
        totalRows?: number
        totalRecords?: number
        totalInfluencers?: number
        results?: any[]
        error?: string
      }
      // Legacy spreadsheet sync (for migration compatibility)
      spreadsheet?: { success: boolean; rowCount?: number; error?: string }
      slack?: { success: boolean; messageCount?: number; error?: string }
    } = {}

    // NEW: Sync all campaign trackers
    if (brand._count.campaignTrackers > 0) {
      try {
        const trackerResult = await syncAllBrandTrackers(params.id, prisma)
        results.trackers = {
          success: trackerResult.results.every((r) => r.success),
          totalTabs: trackerResult.totalTabs,
          totalRows: trackerResult.totalRows,
          totalRecords: trackerResult.totalRecords,
          totalInfluencers: trackerResult.totalInfluencers,
          results: trackerResult.results,
        }
      } catch (error: any) {
        results.trackers = {
          success: false,
          error: error.message || 'Failed to sync trackers',
        }
      }
    }

    // LEGACY: Sync spreadsheet if connected (using public URL method)
    // This is kept for backward compatibility during migration
    if (brand.spreadsheetId && brand._count.campaignTrackers === 0) {
      try {
        const sheetResult = await syncBrandPublicSheet(params.id, prisma)
        results.spreadsheet = {
          success: true,
          rowCount: sheetResult.rowCount,
        }
      } catch (error: any) {
        results.spreadsheet = {
          success: false,
          error: error.message || 'Failed to sync spreadsheet',
        }
      }
    }

    // Sync Slack channel if connected
    if (brand.slackChannelId) {
      try {
        const slackResult = await syncBrandSlackChannel(params.id)
        results.slack = {
          success: true,
          messageCount: slackResult.messageCount,
        }
      } catch (error: any) {
        results.slack = {
          success: false,
          error: error.message || 'Failed to sync Slack',
        }
      }
    }

    const elapsed = Date.now() - startTime
    console.log(`[Sync] Completed in ${elapsed}ms`)
    return NextResponse.json({ ...results, elapsed })
  } catch (error: any) {
    const elapsed = Date.now() - startTime
    console.error(`[Sync] Failed after ${elapsed}ms:`, error)

    // Always return JSON so client can parse the response
    // (Vercel 504 timeout returns HTML, which causes the "Unexpected token" error)
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to sync brand',
      elapsed,
      // Indicate partial data may have been saved if we got past initial stages
      partial: elapsed > 30000,
    }, { status: 500 })
  }
}
