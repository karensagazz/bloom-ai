import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  const checks: Record<string, any> = {}
  let healthy = true

  // Check 1: Database connection
  try {
    await prisma.$runCommandRaw({ ping: 1 })
    checks.database = { status: 'ok', connected: true }
  } catch (error: any) {
    checks.database = { status: 'error', connected: false, error: error.message }
    healthy = false
  }

  // Check 2: Brand count
  try {
    const count = await prisma.brand.count()
    checks.brands = { status: 'ok', count, hasData: count > 0 }
    if (count === 0) {
      checks.brands.warning = 'No brands in database'
    }
  } catch (error: any) {
    checks.brands = { status: 'error', count: 0, error: error.message }
  }

  // Check 3: Environment variables
  checks.environment = {
    databaseUrl: !!process.env.DATABASE_URL,
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    googleApiKey: !!process.env.GOOGLE_API_KEY,
    nodeEnv: process.env.NODE_ENV,
    vercel: !!process.env.VERCEL,
  }

  // Check 4: Slack configuration (optional)
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
      select: { slackBotToken: true },
    })
    checks.slack = {
      status: 'ok',
      configured: !!settings?.slackBotToken,
    }
  } catch (error: any) {
    checks.slack = { status: 'error', error: error.message }
  }

  // Check 5: Brands with Slack channels
  try {
    const slackBrands = await prisma.brand.count({
      where: { slackChannelId: { not: null } },
    })
    checks.slackBrands = { count: slackBrands }
  } catch (error: any) {
    checks.slackBrands = { count: 0, error: error.message }
  }

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: healthy ? 200 : 503 }
  )
}
