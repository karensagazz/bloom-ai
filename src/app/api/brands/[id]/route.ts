import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/brands/[id] - Get a single brand with its data
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: params.id },
      include: {
        campaignTrackers: {
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
        },
        brandInfluencers: {
          orderBy: { totalCampaigns: 'desc' },
          take: 100,
        },
        campaignRecords: {
          // Fetch both campaigns and SOW records (no recordType filter)
          orderBy: { createdAt: 'desc' },
          take: 1000,  // Increased from 200 to handle larger datasets
        },
        slackMessages: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        // Keep sheetRows for backward compatibility during migration
        sheetRows: {
          orderBy: { rowIndex: 'asc' },
        },
      },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    // Parse JSON data in sheet rows (legacy)
    const brandWithParsedData = {
      ...brand,
      sheetRows: brand.sheetRows.map((row) => ({
        ...row,
        data: JSON.parse(row.data),
      })),
      // Add sowRecords as a separate filtered array for contracts
      sowRecords: brand.campaignRecords.filter(record => record.recordType === 'sow'),
    }

    return NextResponse.json(brandWithParsedData)
  } catch (error) {
    console.error('Failed to fetch brand:', error)
    return NextResponse.json({ error: 'Failed to fetch brand' }, { status: 500 })
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
