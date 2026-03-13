import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
})

// Anthropic client for Claude Sonnet (cheaper extraction tasks)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

// Timeout for AI API calls (prevents indefinite hangs during sync)
const AI_TIMEOUT_MS = 45000  // 45 seconds max per AI call

async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
  )
  return Promise.race([promise, timeout])
}

// Get a cheap structured completion using Claude Sonnet
// Used for data extraction tasks where we need JSON output
export async function getCheapStructuredCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 8192
): Promise<string> {
  try {
    const response = await withTimeout(
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
      }),
      AI_TIMEOUT_MS,
      'AI extraction'
    )

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text || '{}'
  } catch (error) {
    console.error('Anthropic API Error:', error)
    throw error
  }
}

// Parse JSON from AI response, handling markdown code blocks
export function parseJSONResponse(text: string): any {
  // Remove markdown code blocks if present
  let cleaned = text.trim()

  // Handle ```json ... ``` blocks
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim()
  }

  // Try to parse
  try {
    return JSON.parse(cleaned)
  } catch (error) {
    // Try to find JSON array or object in the text
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    const objectMatch = cleaned.match(/\{[\s\S]*\}/)

    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0])
      } catch {}
    }

    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0])
      } catch {}
    }

    console.error('Failed to parse JSON response:', text)
    return null
  }
}

export async function getChatCompletion(messages: Array<{ role: string; content: string }>) {
  try {
    // Convert messages to Anthropic format
    // First message should be system if role is 'system', otherwise it's a user message
    const systemMessage = messages.find(m => m.role === 'system')
    const userMessages = messages.filter(m => m.role !== 'system')

    const anthropicMessages = userMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))

    const response = await withTimeout(
      anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: systemMessage?.content || 'You are a helpful assistant.',
        messages: anthropicMessages as any,
        temperature: 0.7,
      }),
      AI_TIMEOUT_MS,
      'Chat completion'
    )

    const textBlock = response.content.find((block) => block.type === 'text')
    return textBlock?.text || 'No response generated.'
  } catch (error) {
    console.error('Anthropic API Error:', error)
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
