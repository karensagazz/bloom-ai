import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { addCampaignTracker, syncCampaignTracker } from '@/lib/campaign-sync'

// GET /api/brands/[id]/trackers - List all trackers for a brand
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const trackers = await prisma.campaignTracker.findMany({
      where: { brandId: params.id },
      include: {
        tabs: {
          select: {
            id: true,
            tabName: true,
            rowCount: true,
            syncedAt: true,
          },
        },
        _count: {
          select: { campaignRecords: true },
        },
      },
      orderBy: { year: 'desc' },
    })

    return NextResponse.json(trackers)
  } catch (error) {
    console.error('Failed to list trackers:', error)
    return NextResponse.json(
      { error: 'Failed to list trackers' },
      { status: 500 }
    )
  }
}

// POST /api/brands/[id]/trackers - Add a new tracker
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { spreadsheetUrl, label, year, autoSync, selectedTabs } = body

    if (!spreadsheetUrl) {
      return NextResponse.json(
        { error: 'spreadsheetUrl is required' },
        { status: 400 }
      )
    }

    // Check brand exists
    const brand = await prisma.brand.findUnique({
      where: { id: params.id },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Add the tracker
    const tracker = await addCampaignTracker(
      params.id,
      spreadsheetUrl,
      label || null,
      year ? parseInt(year, 10) : null,
      prisma,
      selectedTabs // Array of GIDs to sync (optional)
    )

    // Optionally trigger immediate sync
    if (autoSync) {
      // Run sync in background (don't await)
      syncCampaignTracker(tracker.id, prisma).catch((err) =>
        console.error('Background sync failed:', err)
      )
    }

    return NextResponse.json(tracker, { status: 201 })
  } catch (error: any) {
    console.error('Failed to add tracker:', error)

    if (error.message?.includes('already connected')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }

    if (error.message?.includes('Invalid')) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(
      { error: 'Failed to add tracker' },
      { status: 500 }
    )
  }
}
