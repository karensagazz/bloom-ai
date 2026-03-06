import { NextRequest, NextResponse } from 'next/server'
import { draftEmail } from '@/lib/ai'

export async function POST(request: NextRequest) {
  try {
    const { context, purpose } = await request.json()

    if (!context || !purpose) {
      return NextResponse.json(
        { error: 'Context and purpose are required' },
        { status: 400 }
      )
    }

    const draft = await draftEmail(context, purpose)

    return NextResponse.json({ draft })
  } catch (error) {
    console.error('Email draft error:', error)
    return NextResponse.json(
      { error: 'Failed to draft email' },
      { status: 500 }
    )
  }
}
