import { google } from 'googleapis'
import { prisma } from './db'

// Get Google Sheets client with service account credentials
async function getSheetsClient() {
  const settings = await prisma.settings.findUnique({
    where: { id: 'default' },
  })

  if (!settings?.googleServiceEmail || !settings?.googlePrivateKey) {
    throw new Error('Google Sheets credentials not configured. Please add them in Settings.')
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: settings.googleServiceEmail,
      private_key: settings.googlePrivateKey.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })
  return sheets
}

// Extract spreadsheet ID from a Google Sheets URL
export function extractSpreadsheetId(url: string): string | null {
  // Handles URLs like:
  // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit#gid=0
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

// Get spreadsheet metadata (title, sheets/tabs)
export async function getSpreadsheetInfo(spreadsheetId: string) {
  const sheets = await getSheetsClient()

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'properties.title,sheets.properties',
  })

  const spreadsheet = response.data
  return {
    title: spreadsheet.properties?.title || 'Untitled',
    sheets: spreadsheet.sheets?.map((s) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title || 'Sheet1',
    })) || [],
  }
}

// Get all data from a sheet as array of objects
// First row is treated as headers
export async function getSheetData(spreadsheetId: string, sheetName?: string) {
  const sheets = await getSheetsClient()

  // Default to first sheet if not specified
  const range = sheetName ? `'${sheetName}'` : 'Sheet1'

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const rows = response.data.values
  if (!rows || rows.length === 0) {
    return { headers: [], rows: [] }
  }

  // First row is headers
  const headers = rows[0] as string[]

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
}

// Sync a brand's spreadsheet data to the database
export async function syncBrandSpreadsheet(brandId: string) {
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
    // Fetch sheet data
    const { headers, rows } = await getSheetData(brand.spreadsheetId, brand.sheetName || undefined)

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
  } catch (error) {
    // Mark as error
    await prisma.brand.update({
      where: { id: brandId },
      data: { syncStatus: 'error' },
    })
    throw error
  }
}
