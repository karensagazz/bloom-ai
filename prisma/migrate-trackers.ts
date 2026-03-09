/**
 * Migration script to convert existing brands with single spreadsheet
 * to the new multi-tracker system.
 *
 * Run with: npx tsx prisma/migrate-trackers.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting migration: Converting brands to multi-tracker system\n')

  // Find all brands that have a spreadsheetId (old system)
  const brandsWithSpreadsheet = await prisma.brand.findMany({
    where: {
      spreadsheetId: { not: null },
    },
    include: {
      _count: {
        select: { campaignTrackers: true },
      },
    },
  })

  console.log(`Found ${brandsWithSpreadsheet.length} brands with spreadsheets\n`)

  let migrated = 0
  let skipped = 0
  let errors = 0

  for (const brand of brandsWithSpreadsheet) {
    // Skip if brand already has campaign trackers (already migrated)
    if (brand._count.campaignTrackers > 0) {
      console.log(`⏭️  Skipping "${brand.name}" - already has ${brand._count.campaignTrackers} trackers`)
      skipped++
      continue
    }

    try {
      // Create a CampaignTracker for the existing spreadsheet
      const tracker = await prisma.campaignTracker.create({
        data: {
          brandId: brand.id,
          spreadsheetUrl: brand.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${brand.spreadsheetId}`,
          spreadsheetId: brand.spreadsheetId!,
          label: `${new Date().getFullYear()} (migrated)`,
          year: new Date().getFullYear(),
          syncStatus: 'pending',
        },
      })

      console.log(`✅ Migrated "${brand.name}" → Created tracker: ${tracker.label}`)
      migrated++
    } catch (error: any) {
      console.error(`❌ Failed to migrate "${brand.name}": ${error.message}`)
      errors++
    }
  }

  console.log('\n📊 Migration Summary:')
  console.log(`   ✅ Migrated: ${migrated}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   ❌ Errors: ${errors}`)
  console.log(`   📝 Total: ${brandsWithSpreadsheet.length}`)

  if (migrated > 0) {
    console.log('\n🔄 Next steps:')
    console.log('   1. Sync the migrated brands to populate the new data:')
    console.log('      - Go to each brand\'s page and click "Sync All"')
    console.log('      - Or use the API: POST /api/brands/{id}/sync')
    console.log('   2. After successful sync, the new Intelligence, Influencers, and Campaigns tabs will be populated')
    console.log('   3. The old SheetRow data will remain for reference but is no longer used')
  }

  console.log('\n✨ Migration complete!')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error('Migration failed:', e)
    await prisma.$disconnect()
    process.exit(1)
  })
