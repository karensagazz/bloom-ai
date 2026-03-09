import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const brand = await prisma.brand.findUnique({
      where: { id },
      select: {
        syncStatus: true,
        syncProgress: true,
        syncStep: true,
        lastSyncedAt: true,
      },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    return NextResponse.json({
      status: brand.syncStatus,
      progress: brand.syncProgress || 0,
      step: brand.syncStep || 'Idle',
      lastSyncedAt: brand.lastSyncedAt,
    })
  } catch (error) {
    console.error('[Sync Progress] Error:', error)
    return NextResponse.json({ error: 'Failed to get sync progress' }, { status: 500 })
  }
}
