import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { extractSpreadsheetId } from '@/lib/google-sheets-public'

// GET /api/brands - List all brands
export async function GET() {
  try {
    const brands = await prisma.brand.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            campaignTrackers: true,
            brandInfluencers: true,
            campaignRecords: true,
            sheetRows: true,
            slackMessages: true,
          },
        },
      },
    })

    return NextResponse.json(brands)
  } catch (error) {
    console.error('Failed to fetch brands:', error)
    return NextResponse.json({ error: 'Failed to fetch brands' }, { status: 500 })
  }
}

// POST /api/brands - Create a new brand
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { spreadsheetUrl, name, website, slackChannelId, slackChannelName } = body

    // Name is required
    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'Brand name is required' },
        { status: 400 }
      )
    }

    // If spreadsheetUrl is provided, validate it
    let spreadsheetId: string | null = null
    if (spreadsheetUrl) {
      spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
      if (!spreadsheetId) {
        return NextResponse.json(
          { error: 'Invalid Google Sheets URL' },
          { status: 400 }
        )
      }

      // Check if this spreadsheet is already connected (legacy check)
      const existing = await prisma.brand.findFirst({
        where: { spreadsheetId },
      })
      if (existing) {
        return NextResponse.json(
          { error: 'This spreadsheet is already connected to a brand' },
          { status: 400 }
        )
      }
    }

    // Check if this is the first brand - if so, make it default automatically
    const brandCount = await prisma.brand.count()
    const isFirstBrand = brandCount === 0

    // Create the brand
    const brand = await prisma.brand.create({
      data: {
        name: name.trim(),
        spreadsheetId: spreadsheetId || null,
        spreadsheetUrl: spreadsheetUrl || null,
        sheetName: spreadsheetId ? 'Sheet1' : null,
        website: website || null,
        slackChannelId: slackChannelId || null,
        slackChannelName: slackChannelName || null,
        isDefault: isFirstBrand, // First brand is auto-default for Slack
        syncStatus: spreadsheetId ? 'pending' : 'synced', // No tracker = already "synced"
      },
    })

    if (isFirstBrand) {
      console.log('[Brands] First brand created, auto-set as default:', brand.name)
    }

    return NextResponse.json(brand, { status: 201 })
  } catch (error) {
    console.error('Failed to create brand:', error)
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  }
}
