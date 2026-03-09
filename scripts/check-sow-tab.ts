import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkSOW() {
  const sowTab = await prisma.trackerTab.findFirst({
    where: { tabName: { contains: 'SOW' } },
    select: { tabName: true, headers: true, rawData: true, rowCount: true }
  })

  if (!sowTab) {
    console.log('No SOW tab found')
    return
  }

  console.log('=== SOW REVIEW TAB ===')
  console.log(`Tab: ${sowTab.tabName}`)
  console.log(`Rows: ${sowTab.rowCount}`)

  const headers = JSON.parse(sowTab.headers as string)
  console.log(`\nHeaders (${headers.length} columns):`)
  headers.forEach((h: string, i: number) => console.log(`  [${i}] ${h || '(empty)'}`))

  // Check first few rows of rawData
  const rows = JSON.parse(sowTab.rawData as string)
  console.log(`\nFirst 5 rows sample data:`)
  rows.slice(0, 5).forEach((row: Record<string, string>, i: number) => {
    const values = Object.values(row)
    // Show first few columns that have data
    const nonEmpty = values.filter(v => v).slice(0, 3)
    console.log(`  Row ${i}: ${nonEmpty.join(' | ')}`)
  })

  // Look for name column
  console.log('\n=== COLUMN ANALYSIS ===')
  const namePatterns = ['influencer', 'creator', 'name', 'talent', 'partner']
  const normalizedHeaders = headers.map((h: string) => (h || '').toLowerCase().trim())

  for (let i = 0; i < normalizedHeaders.length; i++) {
    for (const pattern of namePatterns) {
      if (normalizedHeaders[i].includes(pattern)) {
        console.log(`Found potential name column: [${i}] "${headers[i]}"`)
        // Show sample values from this column
        const sampleValues = rows.slice(0, 5).map((r: Record<string, string>) => Object.values(r)[i])
        console.log(`  Sample values: ${sampleValues.join(', ')}`)
      }
    }
  }

  await prisma.$disconnect()
}

checkSOW()
