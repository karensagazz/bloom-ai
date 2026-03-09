import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { syncCampaignTracker } from '@/lib/campaign-sync'

// POST /api/brands/[id]/trackers/[trackerId]/sync - Sync a specific tracker
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; trackerId: string } }
) {
  try {
    // Check tracker exists and belongs to brand
    const existing = await prisma.campaignTracker.findFirst({
      where: {
        id: params.trackerId,
        brandId: params.id,
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Tracker not found' }, { status: 404 })
    }

    // Check if already syncing
    if (existing.syncStatus === 'syncing') {
      return NextResponse.json(
        { error: 'Sync already in progress' },
        { status: 409 }
      )
    }

    const startTime = Date.now()

    // Sync the tracker
    const result = await syncCampaignTracker(params.trackerId, prisma)

    const duration = Date.now() - startTime

    return NextResponse.json({
      ...result,
      duration,
    })
  } catch (error: any) {
    console.error('Failed to sync tracker:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to sync tracker' },
      { status: 500 }
    )
  }
}
