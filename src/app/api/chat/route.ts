import { NextRequest, NextResponse } from 'next/server'
import { getChatCompletion } from '@/lib/ai'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json()

    // Get context from database for better responses
    const dealCount = await prisma.deal.count()
    const clientCount = await prisma.client.count()
    const creatorCount = await prisma.creator.count()

    const recentDeals = await prisma.deal.findMany({
      take: 5,
      include: { client: true, creator: true },
      orderBy: { createdAt: 'desc' },
    })

    const systemContext = `You are Bloom AI, an intelligent assistant for an influencer marketing platform.

Current Platform Stats:
- Total Deals: ${dealCount}
- Total Clients: ${clientCount}
- Total Creators: ${creatorCount}

Recent Deals:
${recentDeals.map(d => `- ${d.title} (${d.client.name}, ${d.status})`).join('\n')}

You can help users with:
1. Information about deals, clients, and creators
2. Drafting professional emails
3. Providing insights and recommendations
4. Answering questions about the platform

Be concise, professional, and helpful. When asked about specific data, reference the information above.`

    const fullMessages = [
      { role: 'system', content: systemContext },
      ...messages
    ]

    const response = await getChatCompletion(fullMessages)

    return NextResponse.json({ message: response })
  } catch (error) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
