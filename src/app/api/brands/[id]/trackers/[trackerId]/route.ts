import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/brands/[id]/trackers/[trackerId] - Get a specific tracker
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; trackerId: string } }
) {
  try {
    const tracker = await prisma.campaignTracker.findFirst({
      where: {
        id: params.trackerId,
        brandId: params.id,
      },
      include: {
        tabs: {
          select: {
            id: true,
            gid: true,
            tabName: true,
            tabIndex: true,
            rowCount: true,
            headers: true,
            syncedAt: true,
          },
          orderBy: { tabIndex: 'asc' },
        },
        _count: {
          select: { campaignRecords: true },
        },
      },
    })

    if (!tracker) {
      return NextResponse.json({ error: 'Tracker not found' }, { status: 404 })
    }

    return NextResponse.json(tracker)
  } catch (error) {
    console.error('Failed to get tracker:', error)
    return NextResponse.json(
      { error: 'Failed to get tracker' },
      { status: 500 }
    )
  }
}

// PATCH /api/brands/[id]/trackers/[trackerId] - Update tracker metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; trackerId: string } }
) {
  try {
    const body = await request.json()
    const { label, year } = body

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

    const tracker = await prisma.campaignTracker.update({
      where: { id: params.trackerId },
      data: {
        ...(label !== undefined && { label }),
        ...(year !== undefined && { year: year ? parseInt(year, 10) : null }),
      },
    })

    return NextResponse.json(tracker)
  } catch (error) {
    console.error('Failed to update tracker:', error)
    return NextResponse.json(
      { error: 'Failed to update tracker' },
      { status: 500 }
    )
  }
}

// DELETE /api/brands/[id]/trackers/[trackerId] - Remove a tracker
export async function DELETE(
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

    // Delete the tracker (cascades to TrackerTab and CampaignRecord)
    await prisma.campaignTracker.delete({
      where: { id: params.trackerId },
    })

    // Note: BrandInfluencer records are NOT deleted - they're brand-level
    // and aggregated across all trackers

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete tracker:', error)
    return NextResponse.json(
      { error: 'Failed to delete tracker' },
      { status: 500 }
    )
  }
}
