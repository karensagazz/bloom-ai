import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/settings - Load settings
export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: 'default' },
    })

    if (!settings) {
      return NextResponse.json({})
    }

    // Mask sensitive values for display (show only last 4 chars)
    const masked = {
      slackBotToken: settings.slackBotToken ? `...${settings.slackBotToken.slice(-4)}` : '',
      slackSigningSecret: settings.slackSigningSecret ? `...${settings.slackSigningSecret.slice(-4)}` : '',
      googleServiceEmail: settings.googleServiceEmail || '',
      googlePrivateKey: settings.googlePrivateKey ? '(configured)' : '',
      openaiApiKey: settings.openaiApiKey ? `...${settings.openaiApiKey.slice(-4)}` : '',
    }

    return NextResponse.json(masked)
  } catch (error) {
    console.error('Failed to load settings:', error)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

// POST /api/settings - Save settings
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      slackBotToken,
      slackSigningSecret,
      googleServiceEmail,
      googlePrivateKey,
      openaiApiKey,
    } = body

    // Build update data, only updating fields that are actually provided
    // Skip fields that are masked placeholders
    const updateData: Record<string, string> = {}

    if (slackBotToken && !slackBotToken.startsWith('...')) {
      updateData.slackBotToken = slackBotToken
    }
    if (slackSigningSecret && !slackSigningSecret.startsWith('...')) {
      updateData.slackSigningSecret = slackSigningSecret
    }
    if (googleServiceEmail) {
      updateData.googleServiceEmail = googleServiceEmail
    }
    if (googlePrivateKey && googlePrivateKey !== '(configured)') {
      updateData.googlePrivateKey = googlePrivateKey
    }
    if (openaiApiKey && !openaiApiKey.startsWith('...')) {
      updateData.openaiApiKey = openaiApiKey
    }

    // Upsert settings
    const settings = await prisma.settings.upsert({
      where: { id: 'default' },
      update: {
        ...updateData,
        updatedAt: new Date(),
      },
      create: {
        id: 'default',
        ...updateData,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save settings:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
