import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { brandId } = await request.json()

    if (!brandId) {
      return NextResponse.json(
        { error: 'Brand ID is required' },
        { status: 400 }
      )
    }

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { sheetRows: true },
    })

    if (!brand) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      )
    }

    const creators = await prisma.creator.findMany({
      where: {
        status: 'active',
      },
    })

    if (creators.length === 0) {
      return NextResponse.json({
        matches: [],
        message: 'No active creators found',
      })
    }

    // For now, return all creators as potential matches
    // AI-powered matching can be added later based on brand data from sheets
    const matches = creators.map(creator => ({
      brandId: brand.id,
      creatorId: creator.id,
      creatorName: creator.name,
      score: 70 + Math.random() * 30, // Placeholder score
      reason: `${creator.name} is a potential match for ${brand.name}`,
    }))

    return NextResponse.json({
      matches,
      brand: brand.name,
    })
  } catch (error) {
    console.error('Match generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate matches' },
      { status: 500 }
    )
  }
}
