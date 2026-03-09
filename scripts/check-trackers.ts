import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkTrackers() {
  console.log('🔍 Checking trackers for Coop brand...\n')

  const brands = await prisma.brand.findMany({
    select: { id: true, name: true }
  })

  const brand = brands.find(b => b.name.toLowerCase().includes('coop'))

  if (!brand) {
    console.log('❌ Brand not found')
    await prisma.$disconnect()
    return
  }

  const brandWithTrackers = await prisma.brand.findUnique({
    where: { id: brand.id },
    include: {
      campaignTrackers: {
        include: {
          tabs: {
            select: {
              tabName: true,
              rowCount: true,
              syncedAt: true,
              headers: true
            }
          }
        }
      }
    }
  })

  if (!brandWithTrackers) {
    console.log('❌ Brand not found')
    await prisma.$disconnect()
    return
  }

  console.log(`📊 Brand: ${brandWithTrackers.name}`)
  console.log(`Trackers: ${brandWithTrackers.campaignTrackers.length}\n`)

  for (const tracker of brandWithTrackers.campaignTrackers) {
    console.log(`\n📋 Tracker: ${tracker.year || 'No year'}`)
    console.log(`  URL: ${tracker.spreadsheetUrl}`)
    console.log(`  Last synced: ${tracker.lastSyncedAt}`)
    console.log(`  Tabs: ${tracker.tabs.length}`)

    if (tracker.tabs.length > 0) {
      console.log(`\n  Tab Details:`)
      tracker.tabs.forEach((tab, i) => {
        console.log(`\n  ${i + 1}. "${tab.tabName}"`)
        console.log(`     Rows: ${tab.rowCount}`)
        console.log(`     Synced: ${tab.syncedAt}`)
        const headers = JSON.parse(tab.headers as string)
        console.log(`     Columns: ${headers.join(', ')}`)
      })
    }
  }

  await prisma.$disconnect()
}

checkTrackers().catch(console.error)
