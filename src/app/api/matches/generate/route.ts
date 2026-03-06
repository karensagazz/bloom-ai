import { NextRequest, NextResponse } from 'next/server'
import { generateMatchRecommendations } from '@/lib/ai'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { clientId } = await request.json()

    if (!clientId) {
      return NextResponse.json(
        { error: 'Client ID is required' },
        { status: 400 }
      )
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    })

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    const creators = await prisma.creator.findMany({
      where: {
        status: 'active',
        vertical: client.vertical,
      },
    })

    if (creators.length === 0) {
      return NextResponse.json({
        matches: [],
        message: 'No matching creators found in the same vertical',
      })
    }

    const recommendations = await generateMatchRecommendations(client, creators)

    // Save matches to database
    const savedMatches = []
    for (const rec of recommendations) {
      const creator = creators.find(c => c.name === rec.creatorName)
      if (creator) {
        const match = await prisma.match.create({
          data: {
            clientId: client.id,
            creatorId: creator.id,
            score: rec.score,
            reason: rec.reason,
            status: 'pending',
          },
        })
        savedMatches.push(match)
      }
    }

    return NextResponse.json({
      matches: savedMatches,
      recommendations,
    })
  } catch (error) {
    console.error('Match generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate matches' },
      { status: 500 }
    )
  }
}
