import Anthropic from '@anthropic-ai/sdk'

async function testAnthropicKey() {
  console.log('🔑 Testing Anthropic API Key...\n')

  const apiKey = process.env.ANTHROPIC_API_KEY

  if (!apiKey || apiKey === 'your-anthropic-api-key-here') {
    console.error('❌ No valid Anthropic API key found in .env file')
    console.error('   Current value:', apiKey)
    console.error('\n📝 To fix:')
    console.error('   1. Get an API key from https://console.anthropic.com/')
    console.error('   2. Update ANTHROPIC_API_KEY in .env file')
    console.error('   3. Restart your dev server\n')
    process.exit(1)
  }

  try {
    const anthropic = new Anthropic({ apiKey })

    console.log('📡 Sending test request to Claude...')
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      messages: [
        { role: 'user', content: 'Say "API key is working!" in JSON format with a key called "status"' }
      ],
    })

    const textBlock = response.content.find((block) => block.type === 'text')
    const text = textBlock?.text || ''

    console.log('✅ API Key is valid!')
    console.log('📥 Response:', text.substring(0, 200))
    console.log('\n✨ Your Anthropic API key is configured correctly!')
    console.log('   You can now sync your brands to extract campaign and contract data.\n')
  } catch (error: any) {
    console.error('❌ API Key test failed!')
    if (error.status === 401) {
      console.error('   Error: Invalid API key')
      console.error('   Please check your API key at https://console.anthropic.com/\n')
    } else {
      console.error('   Error:', error.message)
    }
    process.exit(1)
  }
}

testAnthropicKey()
