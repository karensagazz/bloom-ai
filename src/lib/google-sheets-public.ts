// Public Google Sheets access - no API key needed!
// Sheets must be published to the web

import { getSpreadsheetInfo } from './google-sheets'

// Tab info type
export interface TabInfo {
  gid: string
  tabName: string
  tabIndex: number
}

// Extract spreadsheet ID from URL
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// Extract sheet GID (tab ID) from URL
export function extractSheetGid(url: string): string | null {
  const match = url.match(/[#&]gid=([0-9]+)/)
  return match ? match[1] : '0' // Default to first sheet
}

// Discover all tabs in a spreadsheet
// First tries authenticated API, falls back to HTML scraping if that fails
export async function discoverAllTabs(spreadsheetId: string): Promise<TabInfo[]> {
  // Try authenticated path first (more reliable)
  try {
    const info = await getSpreadsheetInfo(spreadsheetId)
    if (info.sheets && info.sheets.length > 0) {
      return info.sheets.map((sheet, index) => ({
        gid: String(sheet.sheetId ?? 0),
        tabName: sheet.title,
        tabIndex: index,
      }))
    }
  } catch (error) {
    // Authenticated API failed (no credentials or permission denied)
    console.log('Authenticated tab discovery failed, trying HTML scraping:', error)
  }

  // Fall back to HTML scraping for public sheets
  try {
    const tabs = await discoverPublicSheetTabs(spreadsheetId)
    if (tabs.length > 0) {
      return tabs
    }
  } catch (error) {
    console.log('HTML scraping failed:', error)
  }

  // Last resort: return default first sheet
  return [{ gid: '0', tabName: 'Sheet1', tabIndex: 0 }]
}

// Discover tabs by fetching the sheet HTML (works for published sheets)
async function discoverPublicSheetTabs(spreadsheetId: string): Promise<TabInfo[]> {
  // Fetch the HTML version of the spreadsheet
  const htmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`

  const response = await fetch(htmlUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Bloom/1.0)'
    }
  })

  if (!response.ok) {
    throw new Error(`Could not fetch sheet HTML: ${response.status}`)
  }

  const html = await response.text()
  const tabs: TabInfo[] = []

  // Method 1: Look for sheet tab buttons in the HTML
  // Google Sheets renders tab buttons with data-id attributes containing the GID
  // Pattern: id="sheet-button-<gid>" or data-sheetid="<gid>"

  // Try to find sheet menu/tabs section
  // Look for patterns like: gid=NUMBER in the HTML
  const gidPattern = /gid[=:](\d+)/gi
  const foundGids = new Set<string>()
  let match

  while ((match = gidPattern.exec(html)) !== null) {
    foundGids.add(match[1])
  }

  // Method 1: Look for JavaScript items.push() pattern (most reliable for htmlview)
  // Format: items.push({name: "Tab Name", pageUrl: "...", gid: "12345", ...})
  const itemsPushPattern = /items\.push\(\{name:\s*"([^"]+)"[^}]*gid:\s*"(\d+)"/gi
  while ((match = itemsPushPattern.exec(html)) !== null) {
    const name = match[1].trim()
    const gid = match[2]
    if (name && gid) {
      tabs.push({
        gid,
        tabName: name,
        tabIndex: tabs.length,
      })
      foundGids.delete(gid) // Remove so we don't duplicate
    }
  }

  // Method 2: Fallback to sheet-button elements (older format)
  if (tabs.length === 0) {
    const sheetButtonPattern = /sheet-button[^>]*data-(?:id|sheetid)="(\d+)"[^>]*>([^<]+)</gi
    while ((match = sheetButtonPattern.exec(html)) !== null) {
      const gid = match[1]
      const name = match[2].trim()
      if (gid && name) {
        tabs.push({
          gid,
          tabName: name,
          tabIndex: tabs.length,
        })
        foundGids.delete(gid) // Remove so we don't duplicate
      }
    }
  }

  // For any remaining gids without names, create generic entries
  let index = tabs.length
  for (const gid of Array.from(foundGids)) {
    // Skip gid=0 if we already have tabs (likely the first sheet)
    if (gid === '0' && tabs.length > 0 && tabs[0].gid !== '0') {
      tabs.unshift({ gid: '0', tabName: 'Sheet1', tabIndex: 0 })
      // Reindex others
      tabs.forEach((t, i) => t.tabIndex = i)
    } else if (!tabs.some(t => t.gid === gid)) {
      tabs.push({
        gid,
        tabName: `Sheet${index + 1}`,
        tabIndex: index++,
      })
    }
  }

  // Sort by tabIndex
  tabs.sort((a, b) => a.tabIndex - b.tabIndex)

  // If we found any tabs, return them
  if (tabs.length > 0) {
    return tabs
  }

  // If no tabs found through HTML, try the pubhtml format
  return discoverPublicSheetTabsViaPubHtml(spreadsheetId)
}

// Alternative method: use the published HTML format which has cleaner tab markup
async function discoverPublicSheetTabsViaPubHtml(spreadsheetId: string): Promise<TabInfo[]> {
  const pubHtmlUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/pubhtml`

  const response = await fetch(pubHtmlUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Bloom/1.0)'
    }
  })

  if (!response.ok) {
    return []
  }

  const html = await response.text()
  const tabs: TabInfo[] = []

  // In pubhtml, sheet tabs are often in a <ul> with <li> containing links
  // Pattern: href="#gid=NUMBER">Sheet Name</a>
  const tabPattern = /href="#gid=(\d+)"[^>]*>([^<]+)</gi
  let match

  while ((match = tabPattern.exec(html)) !== null) {
    const gid = match[1]
    const name = match[2].trim()
    if (gid && name && !tabs.some(t => t.gid === gid)) {
      tabs.push({
        gid,
        tabName: name,
        tabIndex: tabs.length,
      })
    }
  }

  return tabs
}

// Convert Google Sheet to CSV export URL
export function getPublicCsvUrl(spreadsheetId: string, gid: string = '0'): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`
}

// Parse CSV text into rows
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentCell += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      // End of cell
      currentRow.push(currentCell)
      currentCell = ''
    } else if (char === '\n' && !inQuotes) {
      // End of row
      currentRow.push(currentCell)
      rows.push(currentRow)
      currentRow = []
      currentCell = ''
    } else if (char === '\r') {
      // Skip carriage returns
      continue
    } else {
      currentCell += char
    }
  }

  // Add last cell and row if needed
  if (currentCell || currentRow.length > 0) {
    currentRow.push(currentCell)
    rows.push(currentRow)
  }

  return rows.filter(row => row.some(cell => cell.trim())) // Remove empty rows
}

// Fetch and parse a public Google Sheet
export async function fetchPublicSheet(spreadsheetId: string, gid: string = '0') {
  const csvUrl = getPublicCsvUrl(spreadsheetId, gid)

  try {
    const response = await fetch(csvUrl)

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.statusText}. Make sure the sheet is published to the web.`)
    }

    const csvText = await response.text()
    const rows = parseCSV(csvText)

    if (rows.length === 0) {
      return { headers: [], rows: [] }
    }

    // First row is headers
    const headers = rows[0]

    // Convert remaining rows to objects
    const dataRows = rows.slice(1).map((row, index) => {
      const obj: Record<string, string> = {}
      headers.forEach((header, i) => {
        obj[header] = row[i] || ''
      })
      return {
        rowIndex: index,
        data: obj,
      }
    })

    return {
      headers,
      rows: dataRows,
    }
  } catch (error: any) {
    throw new Error(`Failed to fetch public sheet: ${error.message}`)
  }
}

// Fetch all tabs from a spreadsheet in parallel
export async function fetchAllTabs(
  spreadsheetId: string,
  tabs: TabInfo[]
): Promise<Array<TabInfo & { headers: string[]; rows: Array<{ rowIndex: number; data: Record<string, string> }> }>> {
  // Limit concurrent requests to avoid rate limiting
  const CONCURRENT_LIMIT = 5
  const results: Array<TabInfo & { headers: string[]; rows: Array<{ rowIndex: number; data: Record<string, string> }> }> = []

  // Process in batches
  for (let i = 0; i < tabs.length; i += CONCURRENT_LIMIT) {
    const batch = tabs.slice(i, i + CONCURRENT_LIMIT)
    const batchResults = await Promise.allSettled(
      batch.map(async (tab) => {
        try {
          const { headers, rows } = await fetchPublicSheet(spreadsheetId, tab.gid)
          return {
            ...tab,
            headers,
            rows,
          }
        } catch (error) {
          console.error(`Failed to fetch tab ${tab.tabName} (gid=${tab.gid}):`, error)
          return {
            ...tab,
            headers: [],
            rows: [],
          }
        }
      })
    )

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      }
    }
  }

  return results
}

// Sync a brand's public spreadsheet
export async function syncBrandPublicSheet(brandId: string, prisma: any) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
  })

  if (!brand || !brand.spreadsheetId) {
    throw new Error('Brand not found or no spreadsheet connected')
  }

  // Update sync status
  await prisma.brand.update({
    where: { id: brandId },
    data: { syncStatus: 'syncing' },
  })

  try {
    // Extract GID from URL if present
    const gid = brand.spreadsheetUrl ? extractSheetGid(brand.spreadsheetUrl) : '0'

    // Fetch sheet data
    const { headers, rows } = await fetchPublicSheet(brand.spreadsheetId, gid || '0')

    // Delete existing rows and insert new ones
    await prisma.sheetRow.deleteMany({
      where: { brandId },
    })

    if (rows.length > 0) {
      await prisma.sheetRow.createMany({
        data: rows.map((row) => ({
          brandId,
          rowIndex: row.rowIndex,
          data: JSON.stringify(row.data),
        })),
      })
    }

    // Update brand with sync status
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        syncStatus: 'synced',
        lastSyncedAt: new Date(),
      },
    })

    return { success: true, rowCount: rows.length, headers }
  } catch (error: any) {
    // Mark as error
    await prisma.brand.update({
      where: { id: brandId },
      data: { syncStatus: 'error' },
    })
    throw error
  }
}
