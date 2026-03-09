#!/usr/bin/env node

/**
 * Test Script for Hybrid Retrieval System
 * Tests end-to-end flow: Question → Classification → Retrieval → Response
 */

const testQuestions = [
  {
    name: 'Factual Count',
    question: 'How many Instagram campaigns did we run in 2024?',
    expectedType: 'factual_count',
  },
  {
    name: 'Factual List',
    question: 'Which influencers have we worked with?',
    expectedType: 'factual_list',
  },
  {
    name: 'Factual Aggregate',
    question: 'What was our total spend on TikTok?',
    expectedType: 'factual_aggregate',
  },
  {
    name: 'Comparative',
    question: 'Compare our Instagram performance vs TikTok',
    expectedType: 'comparative',
  },
  {
    name: 'Strategic',
    question: 'Should we invest more in nano-influencers?',
    expectedType: 'strategic',
  },
  {
    name: 'Trend',
    question: 'How has our Instagram spending changed over time?',
    expectedType: 'trend',
  },
]

async function testChatAPI(question, brandId) {
  const response = await fetch('http://localhost:3003/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: question }
      ],
      brandId: brandId,
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }

  return await response.json()
}

async function runTests() {
  console.log('🧪 Testing Hybrid Retrieval System\n')
  console.log('=' .repeat(80))

  // First, get a list of brands to test with
  let testBrandId = null

  try {
    const brandsResponse = await fetch('http://localhost:3003/api/brands')
    if (brandsResponse.ok) {
      const brands = await brandsResponse.json()
      if (brands.length > 0) {
        testBrandId = brands[0].id
        console.log(`✓ Using test brand: ${brands[0].name} (${testBrandId})\n`)
      }
    }
  } catch (error) {
    console.log('⚠ Could not fetch brands, will test without brandId\n')
  }

  for (const test of testQuestions) {
    console.log(`\n📝 Test: ${test.name}`)
    console.log(`Question: "${test.question}"`)
    console.log('-'.repeat(80))

    try {
      const result = await testChatAPI(test.question, testBrandId)

      // Verify response structure
      if (!result.message) {
        console.log('❌ FAIL: No message in response')
        continue
      }

      if (!result.metadata) {
        console.log('❌ FAIL: No metadata in response')
        continue
      }

      // Check metadata
      const meta = result.metadata
      console.log(`\n✓ Response received`)
      console.log(`  Query Type: ${meta.queryType}`)
      console.log(`  Confidence: ${(meta.retrievalConfidence * 100).toFixed(0)}%`)
      console.log(`  Sources: ${meta.sources?.length || 0}`)
      console.log(`  Data Quality Warnings: ${meta.dataQualityWarnings?.length || 0}`)
      console.log(`  Has Structured Data: ${meta.hasStructuredData ? 'Yes' : 'No'}`)
      console.log(`  Semantic Results: ${meta.semanticResultCount}`)

      // Check if query type matches expected
      if (meta.queryType === test.expectedType) {
        console.log(`✓ Query classification correct: ${meta.queryType}`)
      } else {
        console.log(`⚠ Query type mismatch: expected ${test.expectedType}, got ${meta.queryType}`)
      }

      // Display response preview
      const preview = result.message.substring(0, 200)
      console.log(`\n📄 Response Preview:`)
      console.log(`  ${preview}${result.message.length > 200 ? '...' : ''}`)

      // Check for anti-hallucination markers
      const hasFactsSection = result.message.includes('**Facts:**') || result.message.includes('📊')
      const hasSourceCitation = result.message.includes('According to') || result.message.includes('Based on')
      const hasUncertaintyHandling = result.message.includes("I don't have") || result.message.includes('limited data')

      console.log(`\n✓ Anti-hallucination checks:`)
      console.log(`  Facts section: ${hasFactsSection ? '✓' : '✗'}`)
      console.log(`  Source citations: ${hasSourceCitation ? '✓' : '✗'}`)
      console.log(`  Uncertainty handling: ${hasUncertaintyHandling ? '✓' : 'N/A'}`)

      console.log('\n✅ PASS')

    } catch (error) {
      console.log(`\n❌ FAIL: ${error.message}`)
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('🏁 Test suite completed\n')
}

// Run tests
runTests().catch(error => {
  console.error('Test suite failed:', error)
  process.exit(1)
})
