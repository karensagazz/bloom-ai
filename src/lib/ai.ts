import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

export async function getChatCompletion(messages: Array<{ role: string; content: string }>) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 1000,
    })

    return response.choices[0]?.message?.content || 'No response generated.'
  } catch (error) {
    console.error('OpenAI API Error:', error)
    return 'Sorry, I encountered an error processing your request.'
  }
}

export async function generateMatchRecommendations(
  client: any,
  creators: any[]
) {
  const prompt = `You are an expert influencer marketing strategist. Analyze the following client and creator roster to recommend the best brand-creator partnership matches.

Client:
- Name: ${client.name}
- Industry: ${client.industry}
- Vertical: ${client.vertical}
- Description: ${client.description || 'N/A'}

Available Creators:
${creators.map((c, i) => `
${i + 1}. ${c.name}
   - Platform: ${c.platform}
   - Followers: ${c.followers}
   - Archetype: ${c.archetype}
   - Vertical: ${c.vertical}
   - Engagement: ${c.engagement || 'N/A'}%
`).join('\n')}

Please recommend the top 3-5 creator matches for this client. For each match, provide:
1. Creator name
2. Match score (0-100)
3. Brief reason why they're a good fit

Format your response as JSON array with this structure:
[
  {
    "creatorName": "Creator Name",
    "score": 85,
    "reason": "Brief explanation of why this is a good match"
  }
]`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: 'You are an expert influencer marketing strategist. Always respond with valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0]?.message?.content || '{}'
    const parsed = JSON.parse(content)
    return parsed.matches || parsed.recommendations || []
  } catch (error) {
    console.error('Match generation error:', error)
    return []
  }
}

export async function draftEmail(context: string, purpose: string) {
  const prompt = `Draft a professional email for the following context:

Context: ${context}
Purpose: ${purpose}

Please write a clear, professional email that is ready to send.`

  return await getChatCompletion([
    { role: 'system', content: 'You are a professional business email writer.' },
    { role: 'user', content: prompt }
  ])
}
