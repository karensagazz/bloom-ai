const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function resetCoopData() {
  const brandId = 'cmmfcb1zh00009p1u2tpfx23s' // Coop

  console.log('🗑️  Deleting old Coop data...\n')

  // Delete in order to avoid foreign key issues
  const deleted = {
    knowledgeDocuments: await prisma.knowledgeDocument.deleteMany({ where: { brandId } }),
    knowledgeFolders: await prisma.knowledgeFolder.deleteMany({ where: { brandId } }),
    strategicRecommendations: await prisma.strategicRecommendation.deleteMany({ where: { brandId } }),
    trendAnalyses: await prisma.trendAnalysis.deleteMany({ where: { brandId } }),
    brandLearnings: await prisma.brandLearning.deleteMany({ where: { brandId } }),
    dataQualityFlags: await prisma.dataQualityFlag.deleteMany({ where: { brandId } }),
    campaignInsights: await prisma.campaignInsight.deleteMany({ where: { brandId } }),
    influencerNotes: await prisma.influencerNote.deleteMany({ where: { brandId } }),
    brandInfluencers: await prisma.brandInfluencer.deleteMany({ where: { brandId } }),
    campaignRecords: await prisma.campaignRecord.deleteMany({ where: { brandId } }),
  }

  console.log('Deleted:')
  for (const [table, result] of Object.entries(deleted)) {
    console.log(`  • ${table}: ${result.count} records`)
  }

  // Reset sync status on trackers so they'll re-sync
  await prisma.campaignTracker.updateMany({
    where: { brandId },
    data: { syncStatus: 'pending', lastSyncedAt: null },
  })

  console.log('\n✅ Coop data cleared! Ready for fresh sync.')
  console.log('   Go to the Coop brand page and click "Sync" to re-import with new tab routing.')

  await prisma.$disconnect()
}

resetCoopData().catch(console.error)
