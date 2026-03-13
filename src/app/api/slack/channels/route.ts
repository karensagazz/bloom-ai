import { NextResponse } from 'next/server'
import { listChannels } from '@/lib/slack-client'

// Force dynamic - API routes should never be prerendered
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const channels = await listChannels()
    return NextResponse.json({ channels })
  } catch (error) {
    console.error('Failed to list Slack channels:', error)
    return NextResponse.json(
      { error: 'Failed to fetch channels. Ensure Slack bot token is configured in Settings.' },
      { status: 500 }
    )
  }
}
