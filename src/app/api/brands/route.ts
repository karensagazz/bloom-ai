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
        syncStatus: spreadsheetId ? 'pending' : 'synced', // No tracker = already "synced"
      },
    })

    return NextResponse.json(brand, { status: 201 })
  } catch (error) {
    console.error('Failed to create brand:', error)
    return NextResponse.json({ error: 'Failed to create brand' }, { status: 500 })
  }
}
