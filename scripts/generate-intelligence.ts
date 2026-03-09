/**
 * Generate Intelligence for a Brand
 *
 * This script runs the AI-powered extraction to generate:
 * - Influencer performance notes
 * - Trend analysis
 * - Strategic recommendations
 * - Knowledge base documents
 */

import { PrismaClient } from '@prisma/client'
import { extractInfluencerNotes, detectTrends, generateStrategicRecommendations } from '../src/lib/qualitative-extractor'
import { generateKnowledgeStructure } from '../src/lib/knowledge-generator'

const prisma = new PrismaClient()

async function generateIntelligence(brandName: string = 'Coop') {
  // Find the brand
  const brand = await prisma.brand.findFirst({
    where: { name: { contains: brandName } }
  })

  if (!brand) {
    console.error(`❌ Brand "${brandName}" not found`)
    return
  }

  console.log(`\n🧠 Generating intelligence for ${brand.name}...\n`)

  // 1. Extract Influencer Notes
  console.log('📝 Extracting influencer performance notes...')
  try {
    const notes = await extractInfluencerNotes(brand.id, prisma)
    console.log(`   Found ${notes.length} notes`)

    // Store in database
    if (notes.length > 0) {
      // Delete existing notes for this brand
      await prisma.influencerNote.deleteMany({
        where: { brandId: brand.id }
      })

      // Create new notes
      let storedNotes = 0
      for (const note of notes) {
        // Find the influencer (required relation)
        const influencer = await prisma.brandInfluencer.findFirst({
          where: {
            brandId: brand.id,
            name: { contains: note.influencerName.split(' ')[0] }
          }
        })

        // Skip if no matching influencer found (required field)
        if (!influencer) {
          console.log(`   ⚠️  Skipping note for "${note.influencerName}" - no matching influencer`)
          continue
        }

        await prisma.influencerNote.create({
          data: {
            brand: { connect: { id: brand.id } },
            influencer: { connect: { id: influencer.id } },
            noteType: note.noteType || 'performance',
            sentiment: note.sentiment || 'neutral',
            content: note.content || '',
            sourceType: note.sourceType || 'ai_extracted',
            confidence: note.confidence || 'medium',
            year: note.year,
          }
        })
        storedNotes++
      }
      console.log(`   ✅ Stored ${storedNotes} influencer notes`)
    }
  } catch (error) {
    console.error('   ❌ Failed to extract influencer notes:', error)
  }

  // 2. Detect Trends
  console.log('\n📈 Detecting trends...')
  try {
    const trends = await detectTrends(brand.id, prisma)
    console.log(`   Found ${trends.length} trends`)

    if (trends.length > 0) {
      // Delete existing trends
      await prisma.trendAnalysis.deleteMany({
        where: { brandId: brand.id }
      })

      // Create new trends
      for (const trend of trends) {
        await prisma.trendAnalysis.create({
          data: {
            brandId: brand.id,
            trendType: trend.trendType,
            metric: trend.metric,
            direction: trend.direction,
            title: trend.title,
            description: trend.description,
            dataPoints: '[]', // Empty JSON array as placeholder
            magnitude: trend.magnitude,
            confidence: trend.confidence,
            timeframe: trend.timeframe,
            platforms: trend.platforms?.join(', ') || null,
            influencers: trend.influencers?.join(', ') || null,
          }
        })
      }
      console.log(`   ✅ Stored ${trends.length} trends`)
    }
  } catch (error) {
    console.error('   ❌ Failed to detect trends:', error)
  }

  // 3. Generate Strategic Recommendations
  console.log('\n💡 Generating strategic recommendations...')
  try {
    const recommendations = await generateStrategicRecommendations(brand.id, prisma)
    console.log(`   Found ${recommendations.length} recommendations`)

    if (recommendations.length > 0) {
      // Delete existing recommendations
      await prisma.strategicRecommendation.deleteMany({
        where: { brandId: brand.id }
      })

      // Create new recommendations
      for (const rec of recommendations) {
        await prisma.strategicRecommendation.create({
          data: {
            brand: { connect: { id: brand.id } },
            category: rec.category || 'general',
            priority: rec.priority || 'medium',
            title: rec.title || 'Recommendation',
            recommendation: rec.recommendation || 'See rationale for details',
            rationale: rec.rationale || 'Based on AI analysis',
            basedOn: JSON.stringify({ source: 'ai_analysis' }),
            confidence: rec.confidence || 'medium',
            expectedImpact: rec.expectedImpact || null,
            timeframe: rec.timeframe || 'ongoing',
          }
        })
      }
      console.log(`   ✅ Stored ${recommendations.length} recommendations`)
    }
  } catch (error) {
    console.error('   ❌ Failed to generate recommendations:', error)
  }

  // 4. Regenerate Knowledge Structure
  console.log('\n📚 Regenerating knowledge structure...')
  try {
    const result = await generateKnowledgeStructure(brand.id, prisma)
    console.log(`   ✅ Created ${result.foldersCreated} folders and ${result.documentsCreated} documents`)
  } catch (error) {
    console.error('   ❌ Failed to regenerate knowledge:', error)
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 INTELLIGENCE SUMMARY')
  console.log('='.repeat(50))

  const counts = {
    influencers: await prisma.brandInfluencer.count({ where: { brandId: brand.id } }),
    notes: await prisma.influencerNote.count({ where: { brandId: brand.id } }),
    insights: await prisma.campaignInsight.count({ where: { brandId: brand.id } }),
    trends: await prisma.trendAnalysis.count({ where: { brandId: brand.id } }),
    recommendations: await prisma.strategicRecommendation.count({ where: { brandId: brand.id } }),
    folders: await prisma.knowledgeFolder.count({ where: { brandId: brand.id } }),
    documents: await prisma.knowledgeDocument.count({ where: { brandId: brand.id } }),
  }

  console.log(`Influencers:     ${counts.influencers}`)
  console.log(`Influencer Notes: ${counts.notes}`)
  console.log(`Campaign Insights: ${counts.insights}`)
  console.log(`Trends:          ${counts.trends}`)
  console.log(`Recommendations: ${counts.recommendations}`)
  console.log(`Knowledge Folders: ${counts.folders}`)
  console.log(`Knowledge Docs:  ${counts.documents}`)
  console.log('='.repeat(50))

  await prisma.$disconnect()
}

generateIntelligence(process.argv[2] || 'Coop')
