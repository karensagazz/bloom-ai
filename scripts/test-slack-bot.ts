/**
 * Test Slack Bot Flow
 *
 * This script tests the Slack bot by:
 * 1. Simulating a Slack event
 * 2. Running the agent directly
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testSlackBot() {
  console.log('\n🧪 Testing Slack Bot Flow\n')

  // 1. Find the Coop brand
  const brand = await prisma.brand.findFirst({
    where: { name: { contains: 'Coop' } }
  })

  if (!brand) {
    console.error('❌ Coop brand not found')
    return
  }

  console.log('✅ Found brand:', brand.name)
  console.log('   Brand ID:', brand.id)
  console.log('   Slack Channel:', brand.slackChannelId)

  // 2. Check if channel ID matches expected
  console.log('\n📋 Expected channel from screenshots: C0AK3M8KFEE')
  console.log('   Configured channel:', brand.slackChannelId)
  console.log('   Match:', brand.slackChannelId === 'C0AK3M8KFEE' ? '✅ Yes' : '❌ No')

  // 3. Check intelligence data
  const counts = {
    campaigns: await prisma.campaignRecord.count({ where: { brandId: brand.id } }),
    influencers: await prisma.brandInfluencer.count({ where: { brandId: brand.id } }),
    insights: await prisma.campaignInsight.count({ where: { brandId: brand.id } }),
    recommendations: await prisma.strategicRecommendation.count({ where: { brandId: brand.id } }),
  }

  console.log('\n📊 Intelligence data:')
  console.log('   Campaigns:', counts.campaigns)
  console.log('   Influencers:', counts.influencers)
  console.log('   Insights:', counts.insights)
  console.log('   Recommendations:', counts.recommendations)

  // 4. Test the agent directly
  console.log('\n🤖 Testing agent with question: "who are top performers"')
  console.log('   (This may take 10-30 seconds...)\n')

  try {
    const { runSlackAgent } = await import('../src/lib/slack-bot-agent')

    const result = await runSlackAgent({
      brandId: brand.id,
      question: 'who are the top performers',
      threadContext: [],
      channelHistory: [],
    })

    console.log('✅ Agent responded successfully!\n')
    console.log('--- RESPONSE ---')
    console.log(result.answer)
    console.log('----------------\n')

    // Tools used information removed from result type
  } catch (error) {
    console.error('❌ Agent failed:', error)
  }

  // 5. Instructions for Slack Event Subscriptions
  console.log('\n' + '='.repeat(60))
  console.log('📱 SLACK EVENT SUBSCRIPTIONS SETUP')
  console.log('='.repeat(60))
  console.log(`
If the bot test above worked but Slack isn't responding, you need to
configure Event Subscriptions in your Slack App:

1. Go to: https://api.slack.com/apps
2. Select your Bloom app
3. Navigate to "Event Subscriptions" in the left sidebar
4. Enable Events (toggle ON)
5. Set Request URL to your server URL:
   - Local: Use ngrok to get a public URL
   - Production: https://your-domain.com/api/slack/events
6. Under "Subscribe to bot events", add:
   - app_mention (for @Bloom mentions)
   - message.im (for direct messages)
7. Save Changes
8. Reinstall the app to your workspace if prompted

The Slack bot user ID is: U0AJMFLNA79
The channel ID is: ${brand.slackChannelId}
`)

  await prisma.$disconnect()
}

testSlackBot()
