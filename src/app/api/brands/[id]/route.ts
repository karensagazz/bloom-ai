import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/brands/[id] - Get a single brand with its data
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // First, fetch the brand without includes to ensure it exists
    const brand = await prisma.brand.findUnique({
      where: { id: params.id },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Then fetch related data separately to handle empty relations gracefully
    const [campaignTrackers, brandInfluencers, campaignRecords, slackMessages, sheetRows] = await Promise.allSettled([
      prisma.campaignTracker.findMany({
        where: { brandId: params.id },
        orderBy: { createdAt: 'desc' },
        include: {
          tabs: {
            select: {
              id: true,
              tabName: true,
              rowCount: true,
              syncedAt: true,
            },
            orderBy: { tabIndex: 'asc' },
          },
          _count: {
            select: { campaignRecords: true },
          },
        },
      }),
      prisma.brandInfluencer.findMany({
        where: { brandId: params.id },
        orderBy: { totalCampaigns: 'desc' },
        take: 100,
      }),
      prisma.campaignRecord.findMany({
        where: { brandId: params.id },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.slackMessage.findMany({
        where: { brandId: params.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.sheetRow.findMany({
        where: { brandId: params.id },
        orderBy: { rowIndex: 'asc' },
      }),
    ])

    // Parse JSON data in sheet rows (legacy) - with safe parsing
    const parsedSheetRows = (sheetRows.status === 'fulfilled' ? sheetRows.value : []).map((row) => ({
      ...row,
      data: row.data ? (() => {
        try {
          return JSON.parse(row.data)
        } catch {
          console.warn(`[Brand ${params.id}] Invalid JSON in sheetRow ${row.id}`)
          return {}
        }
      })() : {},
    }))

    const allCampaignRecords = campaignRecords.status === 'fulfilled' ? campaignRecords.value : []

    const brandWithParsedData = {
      ...brand,
      campaignTrackers: campaignTrackers.status === 'fulfilled' ? campaignTrackers.value : [],
      brandInfluencers: brandInfluencers.status === 'fulfilled' ? brandInfluencers.value : [],
      campaignRecords: allCampaignRecords,
      slackMessages: slackMessages.status === 'fulfilled' ? slackMessages.value : [],
      sheetRows: parsedSheetRows,
      // Add sowRecords as a separate filtered array for contracts
      sowRecords: allCampaignRecords.filter(record => record.recordType === 'sow'),
    }

    return NextResponse.json(brandWithParsedData)
  } catch (error: any) {
    console.error('[BRAND-API-V2] Failed to fetch brand:', error?.message || error)
    console.error('[BRAND-API-V2] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    return NextResponse.json({
      error: 'Brand fetch failed v2',
      message: error?.message || String(error),
      name: error?.name || 'Unknown',
      code: error?.code || 'NO_CODE'
    }, { status: 500 })
  }
}

// PUT /api/brands/[id] - Update a brand
export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const { name, website, slackChannelId, slackChannelName, sheetName, isDefault } = body

    // If setting this brand as default, unset all others first
    if (isDefault === true) {
      await prisma.brand.updateMany({
        where: { isDefault: true, id: { not: params.id } },
        data: { isDefault: false },
      })
      console.log('[Brands] Setting new default brand:', params.id)
    }

    const brand = await prisma.brand.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(website !== undefined && { website }),
        ...(slackChannelId !== undefined && { slackChannelId }),
        ...(slackChannelName !== undefined && { slackChannelName }),
        ...(sheetName && { sheetName }),
        ...(isDefault !== undefined && { isDefault }),
      },
    })

    return NextResponse.json(brand)
  } catch (error) {
    console.error('Failed to update brand:', error)
    return NextResponse.json({ error: 'Failed to update brand' }, { status: 500 })
  }
}

// DELETE /api/brands/[id] - Delete a brand
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.brand.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete brand:', error)
    return NextResponse.json({ error: 'Failed to delete brand' }, { status: 500 })
  }
}
