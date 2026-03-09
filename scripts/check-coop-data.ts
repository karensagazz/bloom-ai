import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkCoopData() {
  console.log('🔍 Checking Coop brand data...\n')

  // Find Coop brand (SQLite doesn't support case-insensitive contains)
  const allBrandsFirst = await prisma.brand.findMany({
    select: { id: true, name: true }
  })

  const brands = allBrandsFirst.filter(b =>
    b.name.toLowerCase().includes('coop')
  )

  if (brands.length === 0) {
    console.log('❌ No brands found matching "Coop"')
    console.log('\nAll brands:')
    const allBrands = await prisma.brand.findMany({ select: { id: true, name: true } })
    allBrands.forEach(b => console.log(`  - ${b.name} (${b.id})`))
    await prisma.$disconnect()
    return
  }

  for (const brand of brands) {
    console.log(`\n📊 Brand: ${brand.name} (${brand.id})`)
    console.log('=' .repeat(60))

    // Count records by type
    const campaignCount = await prisma.campaignRecord.count({
      where: { brandId: brand.id, recordType: 'campaign' }
    })

    const sowCount = await prisma.campaignRecord.count({
      where: { brandId: brand.id, recordType: 'sow' }
    })

    const totalRecords = await prisma.campaignRecord.count({
      where: { brandId: brand.id }
    })

    console.log(`\n📈 Record Counts:`)
    console.log(`  Campaign records: ${campaignCount}`)
    console.log(`  SOW records: ${sowCount}`)
    console.log(`  Total records: ${totalRecords}`)

    // Sample SOW records
    if (sowCount > 0) {
      console.log(`\n📋 Sample SOW Records (first 5):`)
      const sowRecords = await prisma.campaignRecord.findMany({
        where: { brandId: brand.id, recordType: 'sow' },
        take: 5,
        select: {
          id: true,
          influencerName: true,
          tabName: true,
          deliverables: true,
          exclusivity: true,
          usageRights: true,
          contractStart: true,
          contractEnd: true
        }
      })

      sowRecords.forEach((record, i) => {
        console.log(`\n  ${i + 1}. ${record.influencerName || '(no name)'}`)
        console.log(`     Tab: ${record.tabName}`)
        console.log(`     Term: ${record.contractStart} → ${record.contractEnd}`)
        console.log(`     Deliverables: ${record.deliverables?.substring(0, 50) || 'none'}`)
        console.log(`     Exclusivity: ${record.exclusivity || 'none'}`)
        console.log(`     Usage Rights: ${record.usageRights || 'none'}`)
      })
    }

    // Check tab names to understand classification
    console.log(`\n📑 Tab Names (to understand classification):`)
    const tabs = await prisma.campaignRecord.findMany({
      where: { brandId: brand.id },
      select: { tabName: true, recordType: true },
      distinct: ['tabName']
    })

    tabs.forEach(tab => {
      console.log(`  - "${tab.tabName}" → ${tab.recordType}`)
    })

    // Count influencers
    const influencerCount = await prisma.brandInfluencer.count({
      where: { brandId: brand.id }
    })
    console.log(`\n👥 Influencers: ${influencerCount}`)
  }

  await prisma.$disconnect()
}

checkCoopData().catch(console.error)
