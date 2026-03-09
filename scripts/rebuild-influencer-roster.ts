/**
 * Rebuild Influencer Roster from CampaignRecords
 *
 * The original buildInfluencerRoster reads from SOW Review tabs,
 * but those tabs have internal team data, not influencer names.
 *
 * This script builds the roster directly from the already-extracted
 * CampaignRecord table which has the correct influencer names.
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Internal team members to exclude
const INTERNAL_TEAM = new Set([
  'amanda knoll',
  'clara freitas',
  'gabrielly sudario',
  'rachel velazquez',
  'karen sagaz',
  'lauren kim',
  'lily comba',
  'julia schwarz',
  'jenn echols',
  'karen',
  'amanda',
  'owner',
])

function isInternalTeamMember(name: string): boolean {
  const normalized = name.toLowerCase().trim()
  return INTERNAL_TEAM.has(normalized) ||
         normalized.length < 3 ||
         normalized === 'n/a' ||
         normalized === 'tbd' ||
         normalized === 'pending'
}

async function rebuildInfluencerRoster(brandName: string = 'Coop') {
  // Find the brand (SQLite doesn't support case-insensitive mode)
  const brand = await prisma.brand.findFirst({
    where: { name: { contains: brandName } }
  })

  if (!brand) {
    console.error(`❌ Brand "${brandName}" not found`)
    return
  }

  console.log(`\n🔄 Rebuilding influencer roster for ${brand.name}...`)

  // Get all campaign records with influencer names
  const records = await prisma.campaignRecord.findMany({
    where: {
      brandId: brand.id,
      influencerName: { not: null }
    },
    select: {
      influencerName: true,
      platform: true,
      dealValue: true,
      contentType: true,
      status: true,
    }
  })

  console.log(`📊 Found ${records.length} campaign records with influencer names`)

  // Group by influencer name
  const influencerMap = new Map<string, {
    name: string
    platforms: Set<string>
    dealValues: string[]
    contentTypes: Set<string>
    statuses: Set<string>
    count: number
  }>()

  for (const record of records) {
    const name = record.influencerName?.trim()
    if (!name) continue
    if (isInternalTeamMember(name)) {
      continue
    }

    const key = name.toLowerCase()

    if (!influencerMap.has(key)) {
      influencerMap.set(key, {
        name,
        platforms: new Set(),
        dealValues: [],
        contentTypes: new Set(),
        statuses: new Set(),
        count: 0,
      })
    }

    const inf = influencerMap.get(key)!
    inf.count++

    if (record.platform) inf.platforms.add(record.platform)
    if (record.dealValue) inf.dealValues.push(record.dealValue)
    if (record.contentType) inf.contentTypes.add(record.contentType)
    if (record.status) inf.statuses.add(record.status)
  }

  console.log(`👥 Found ${influencerMap.size} unique influencers`)

  // Delete existing influencers for this brand
  const deleted = await prisma.brandInfluencer.deleteMany({
    where: { brandId: brand.id }
  })
  console.log(`🗑️  Deleted ${deleted.count} old influencer records`)

  // Create new influencer records
  let created = 0
  for (const data of Array.from(influencerMap.values())) {
    // Estimate rate from deal values
    const estimatedRate = estimateRateRange(data.dealValues)
    const primaryPlatform = Array.from(data.platforms).join(' + ') || null

    await prisma.brandInfluencer.create({
      data: {
        brandId: brand.id,
        name: data.name,
        platform: primaryPlatform,
        totalCampaigns: data.count,
        estimatedRate,
        notes: `Content types: ${Array.from(data.contentTypes).join(', ') || 'N/A'}`,
      }
    })
    created++
  }

  console.log(`✅ Created ${created} influencer records`)

  // Show top 10 by campaign count
  const topInfluencers = Array.from(influencerMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  console.log('\n🏆 Top 10 Influencers by Campaign Count:')
  topInfluencers.forEach((inf, i) => {
    console.log(`  ${i + 1}. ${inf.name} - ${inf.count} campaigns (${Array.from(inf.platforms).join(', ') || 'platform TBD'})`)
  })

  await prisma.$disconnect()
}

function estimateRateRange(dealValues: string[]): string | null {
  if (dealValues.length === 0) return null

  const numbers: number[] = []
  for (const val of dealValues) {
    const match = val.match(/[\d,]+\.?\d*/g)
    if (match) {
      for (const numStr of match) {
        const num = parseFloat(numStr.replace(/,/g, ''))
        if (!isNaN(num) && num > 0 && num < 1000000) {
          numbers.push(num)
        }
      }
    }
  }

  if (numbers.length === 0) return null

  const min = Math.min(...numbers)
  const max = Math.max(...numbers)

  const formatCurrency = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`

  if (min === max) {
    return formatCurrency(min)
  }
  return `${formatCurrency(min)} - ${formatCurrency(max)}`
}

rebuildInfluencerRoster(process.argv[2] || 'Coop')
