import { NextResponse } from 'next/server'
import { WebClient } from '@slack/web-api'
import { prisma } from '@/lib/db'

export async function GET() {
  const checks: Record<string, any> = {}

  // Check 1: Anthropic API key
  checks.anthropicKey = {
    configured: !!process.env.ANTHROPIC_API_KEY &&
                !process.env.ANTHROPIC_API_KEY.includes('your-'),
    preview: process.env.ANTHROPIC_API_KEY
      ? process.env.ANTHROPIC_API_KEY.slice(0, 12) + '...'
      : 'not set'
  }

  // Check 2: Slack bot token in DB
  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  checks.slackToken = {
    configured: !!settings?.slackBotToken,
    preview: settings?.slackBotToken
      ? settings.slackBotToken.slice(0, 10) + '...'
      : 'not set'
  }

  // Check 3: Test Slack connection
  if (settings?.slackBotToken) {
    try {
      const client = new WebClient(settings.slackBotToken)
      const authTest = await client.auth.test()
      checks.slackConnection = {
        ok: true,
        botUserId: authTest.user_id,
        botName: authTest.user,
        team: authTest.team,
        teamId: authTest.team_id,
      }
    } catch (error: any) {
      checks.slackConnection = {
        ok: false,
        error: error.message,
      }
    }
  } else {
    checks.slackConnection = {
      ok: false,
      error: 'No Slack token configured'
    }
  }

  // Check 4: Brands with Slack channels connected
  const brandsWithSlack = await prisma.brand.findMany({
    where: { slackChannelId: { not: null } },
    select: { name: true, slackChannelId: true, slackChannelName: true }
  })
  checks.connectedBrands = {
    count: brandsWithSlack.length,
    brands: brandsWithSlack
  }

  // Check 5: Intelligence data counts
  const coopBrand = await prisma.brand.findFirst({
    where: { name: { contains: 'Coop' } }
  })

  if (coopBrand) {
    checks.intelligenceData = {
      brandId: coopBrand.id,
      brandName: coopBrand.name,
      campaigns: await prisma.campaignRecord.count({ where: { brandId: coopBrand.id } }),
      influencers: await prisma.brandInfluencer.count({ where: { brandId: coopBrand.id } }),
      insights: await prisma.campaignInsight.count({ where: { brandId: coopBrand.id } }),
      notes: await prisma.influencerNote.count({ where: { brandId: coopBrand.id } }),
      recommendations: await prisma.strategicRecommendation.count({ where: { brandId: coopBrand.id } }),
      knowledgeDocs: await prisma.knowledgeDocument.count({ where: { brandId: coopBrand.id } }),
    }
  }

  const healthy = checks.anthropicKey.configured &&
                  checks.slackToken.configured &&
                  checks.slackConnection?.ok &&
                  checks.connectedBrands.count > 0

  return NextResponse.json({
    status: healthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  }, { status: healthy ? 200 : 503 })
}
