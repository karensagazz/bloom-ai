import { NextResponse } from 'next/server'
import { extractSpreadsheetId, discoverAllTabs } from '@/lib/google-sheets-public'

// Determine what type of data a tab likely contains based on its name
function detectTabType(tabName: string): 'campaigns' | 'contracts' | 'influencers' | 'unknown' {
  const normalized = tabName.trim().toLowerCase()

  // Skip patterns - tabs to avoid
  const skipPatterns = [
    'paid usage', 'ad repository', 'paid extensions', 'paid media report',
    'template', 'archive', 'old', 'copy', 'test', 'example',
    'instructions', 'readme', 'help', 'notes', 'draft', 'backup',
    'do not', 'dont', "don't", 'ignore', 'deprecated', 'unused'
  ]

  if (skipPatterns.some(pattern => normalized.includes(pattern))) {
    return 'unknown'
  }

  // Campaigns
  if (normalized.includes('campaign tracker') ||
      normalized.includes('dashboard') ||
      normalized.includes('overview') ||
      normalized.includes('summary') ||
      normalized.includes('main') ||
      normalized.includes('master')) {
    return 'campaigns'
  }

  // Contracts
  if (normalized.includes('contracts') || normalized.includes('sow')) {
    return 'contracts'
  }

  // Influencers
  if (normalized.includes('sow review') ||
      normalized.includes('influencer') ||
      normalized.includes('creator') ||
      normalized.includes('talent')) {
    return 'influencers'
  }

  return 'unknown'
}

// POST /api/sheets/discover-tabs
// Discovers all tabs in a Google Sheets document
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { spreadsheetUrl } = body

    if (!spreadsheetUrl) {
      return NextResponse.json({ error: 'spreadsheetUrl is required' }, { status: 400 })
    }

    // Extract spreadsheet ID from URL
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Invalid Google Sheets URL' }, { status: 400 })
    }

    // Discover all tabs
    const tabs = await discoverAllTabs(spreadsheetId)

    // Add detected type and recommendation to each tab
    const enrichedTabs = tabs.map(tab => {
      const detectedType = detectTabType(tab.tabName)
      return {
        ...tab,
        detectedType,
        recommended: detectedType !== 'unknown', // Recommend tabs with known data types
      }
    })

    return NextResponse.json({
      spreadsheetId,
      tabs: enrichedTabs,
    })
  } catch (error) {
    console.error('Failed to discover tabs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to discover tabs' },
      { status: 500 }
    )
  }
}
