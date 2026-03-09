const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkKnowledgeData() {
  const brandId = 'cmmfcb1zh00009p1u2tpfx23s' // Coop

  // Check all the tables that feed into knowledge generation
  const counts = {
    campaignInsights: await prisma.campaignInsight.count({ where: { brandId } }),
    influencerNotes: await prisma.influencerNote.count({ where: { brandId } }),
    brandLearnings: await prisma.brandLearning.count({ where: { brandId } }),
    trendAnalyses: await prisma.trendAnalysis.count({ where: { brandId } }),
    strategicRecommendations: await prisma.strategicRecommendation.count({ where: { brandId } }),
    knowledgeFolders: await prisma.knowledgeFolder.count({ where: { brandId } }),
    knowledgeDocuments: await prisma.knowledgeDocument.count({ where: { brandId } }),
  }

  console.log('📊 Knowledge Data Status for Coop:\n')
  console.log('Source Data (what feeds knowledge base):')
  console.log(`  • Campaign Insights: ${counts.campaignInsights}`)
  console.log(`  • Influencer Notes: ${counts.influencerNotes}`)
  console.log(`  • Brand Learnings: ${counts.brandLearnings}`)
  console.log(`  • Trend Analyses: ${counts.trendAnalyses}`)
  console.log(`  • Strategic Recommendations: ${counts.strategicRecommendations}`)
  console.log('')
  console.log('Knowledge Base:')
  console.log(`  • Folders: ${counts.knowledgeFolders}`)
  console.log(`  • Documents: ${counts.knowledgeDocuments}`)

  if (counts.campaignInsights === 0 && counts.influencerNotes === 0) {
    console.log('\n⚠️  ISSUE: No AI-extracted insights or notes!')
    console.log('   The knowledge base needs these to create documents.')
    console.log('   This happens when the qualitative extraction step fails or hasn\'t run.')
  }

  await prisma.$disconnect()
}

checkKnowledgeData()
