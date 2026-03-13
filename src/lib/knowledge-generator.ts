// Knowledge Generator
// Auto-generates hierarchical folder/document structure from existing qualitative data

import { PrismaClient } from '@prisma/client'

// ============================================================================
// TYPES
// ============================================================================

interface FolderConfig {
  name: string
  icon: string
  orderIndex: number
  children?: FolderConfig[]
}

interface DocumentConfig {
  title: string
  documentType: string
  icon: string
  orderIndex: number
}

// ============================================================================
// FOLDER STRUCTURE DEFINITION
// ============================================================================

const SYSTEM_FOLDER_STRUCTURE: FolderConfig[] = [
  {
    name: 'Influencers',
    icon: 'users',
    orderIndex: 1,
    children: [
      { name: 'Top Performers', icon: 'star', orderIndex: 1 },
      { name: 'Reliability Issues', icon: 'alert-triangle', orderIndex: 2 },
      { name: 'By Platform', icon: 'layers', orderIndex: 3 },
    ],
  },
  {
    name: 'Campaign Insights',
    icon: 'lightbulb',
    orderIndex: 2,
    children: [
      { name: 'Performance', icon: 'bar-chart', orderIndex: 1 },
      { name: 'Creative Strategy', icon: 'palette', orderIndex: 2 },
      { name: 'Timing & Seasonal', icon: 'calendar', orderIndex: 3 },
      { name: 'Budget & ROI', icon: 'dollar-sign', orderIndex: 4 },
    ],
  },
  {
    name: 'Strategic Intelligence',
    icon: 'trending-up',
    orderIndex: 3,
  },
  {
    name: 'Deals & Contracts',
    icon: 'file-text',
    orderIndex: 4,
  },
  {
    name: 'Industry Knowledge',
    icon: 'book-open',
    orderIndex: 5,
  },
  {
    name: 'Slack Context',
    icon: 'message-square',
    orderIndex: 6,
  },
  {
    name: 'Custom Notes',
    icon: 'folder',
    orderIndex: 7,
  },
]

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export async function generateKnowledgeStructure(
  brandId: string,
  prisma: PrismaClient
): Promise<{ foldersCreated: number; documentsCreated: number }> {
  let foldersCreated = 0
  let documentsCreated = 0

  // Check if structure already exists
  const existingFolders = await prisma.knowledgeFolder.count({
    where: { brandId, folderType: 'system' },
  })

  if (existingFolders > 0) {
    // Just update documents
    const docsUpdated = await regenerateDocuments(brandId, prisma)
    return { foldersCreated: 0, documentsCreated: docsUpdated }
  }

  // Create folder structure
  const folderMap: Record<string, string> = {} // name -> id

  for (const folderConfig of SYSTEM_FOLDER_STRUCTURE) {
    const folder = await prisma.knowledgeFolder.create({
      data: {
        brandId,
        name: folderConfig.name,
        icon: folderConfig.icon,
        orderIndex: folderConfig.orderIndex,
        folderType: 'system',
      },
    })
    folderMap[folderConfig.name] = folder.id
    foldersCreated++

    // Create child folders
    if (folderConfig.children) {
      for (const childConfig of folderConfig.children) {
        const childFolder = await prisma.knowledgeFolder.create({
          data: {
            brandId,
            parentId: folder.id,
            name: childConfig.name,
            icon: childConfig.icon,
            orderIndex: childConfig.orderIndex,
            folderType: 'system',
          },
        })
        folderMap[childConfig.name] = childFolder.id
        foldersCreated++
      }
    }
  }

  // Generate documents
  documentsCreated = await regenerateDocuments(brandId, prisma, folderMap)

  return { foldersCreated, documentsCreated }
}

// ============================================================================
// DOCUMENT REGENERATION
// ============================================================================

async function regenerateDocuments(
  brandId: string,
  prisma: PrismaClient,
  folderMapOverride?: Record<string, string>
): Promise<number> {
  let documentsCreated = 0

  // Build folder map if not provided
  const folderMap =
    folderMapOverride || (await buildFolderMap(brandId, prisma))

  // --- Influencer Documents ---

  // Top Performers (positive notes)
  const topPerformersDoc = await generateInfluencerNotesDocument(
    brandId,
    prisma,
    folderMap['Top Performers'],
    'High-Performing Creators',
    'positive',
    1
  )
  if (topPerformersDoc) documentsCreated++

  // Reliability Issues (negative notes)
  const reliabilityDoc = await generateInfluencerNotesDocument(
    brandId,
    prisma,
    folderMap['Reliability Issues'],
    'Communication & Delivery Concerns',
    'negative',
    1
  )
  if (reliabilityDoc) documentsCreated++

  // By Platform - Instagram
  const igDoc = await generatePlatformInfluencersDocument(
    brandId,
    prisma,
    folderMap['By Platform'],
    'Instagram Creators',
    'Instagram',
    1
  )
  if (igDoc) documentsCreated++

  // By Platform - TikTok
  const ttDoc = await generatePlatformInfluencersDocument(
    brandId,
    prisma,
    folderMap['By Platform'],
    'TikTok Creators',
    'TikTok',
    2
  )
  if (ttDoc) documentsCreated++

  // By Platform - YouTube
  const ytDoc = await generatePlatformInfluencersDocument(
    brandId,
    prisma,
    folderMap['By Platform'],
    'YouTube Creators',
    'YouTube',
    3
  )
  if (ytDoc) documentsCreated++

  // --- Campaign Insight Documents ---

  // Performance insights
  const perfDoc = await generateInsightCollectionDocument(
    brandId,
    prisma,
    folderMap['Performance'],
    'Performance Insights',
    'performance',
    1
  )
  if (perfDoc) documentsCreated++

  // Creative insights
  const creativeDoc = await generateInsightCollectionDocument(
    brandId,
    prisma,
    folderMap['Creative Strategy'],
    'Creative Strategy Insights',
    'creative',
    1
  )
  if (creativeDoc) documentsCreated++

  // Timing insights
  const timingDoc = await generateInsightCollectionDocument(
    brandId,
    prisma,
    folderMap['Timing & Seasonal'],
    'Timing & Seasonal Insights',
    'timing',
    1
  )
  if (timingDoc) documentsCreated++

  // Budget insights
  const budgetDoc = await generateInsightCollectionDocument(
    brandId,
    prisma,
    folderMap['Budget & ROI'],
    'Budget & ROI Insights',
    'budget',
    1
  )
  if (budgetDoc) documentsCreated++

  // --- Strategic Intelligence Documents ---

  // Brand Learnings
  const learningsDoc = await generateLearningsDocument(
    brandId,
    prisma,
    folderMap['Strategic Intelligence'],
    'Brand Learnings',
    1
  )
  if (learningsDoc) documentsCreated++

  // Active Trends
  const trendsDoc = await generateTrendsDocument(
    brandId,
    prisma,
    folderMap['Strategic Intelligence'],
    'Active Trends',
    'active',
    2
  )
  if (trendsDoc) documentsCreated++

  // Pending Recommendations
  const recsDoc = await generateRecommendationsDocument(
    brandId,
    prisma,
    folderMap['Strategic Intelligence'],
    'Pending Recommendations',
    'pending',
    3
  )
  if (recsDoc) documentsCreated++

  // Implemented Recommendations
  const implDoc = await generateRecommendationsDocument(
    brandId,
    prisma,
    folderMap['Strategic Intelligence'],
    'Implemented Actions',
    'implemented',
    4
  )
  if (implDoc) documentsCreated++

  // --- Deals & Contracts Documents ---

  // Active SOWs
  const sowDoc = await generateSOWDocument(
    brandId,
    prisma,
    folderMap['Deals & Contracts'],
    'Active Contracts',
    1
  )
  if (sowDoc) documentsCreated++

  // --- Slack Context Documents ---

  // Recent conversations
  const slackDoc = await generateSlackDocument(
    brandId,
    prisma,
    folderMap['Slack Context'],
    'Recent Conversations',
    1
  )
  if (slackDoc) documentsCreated++

  return documentsCreated
}

// ============================================================================
// DOCUMENT GENERATOR HELPERS
// ============================================================================

async function buildFolderMap(
  brandId: string,
  prisma: PrismaClient
): Promise<Record<string, string>> {
  const folders = await prisma.knowledgeFolder.findMany({
    where: { brandId, folderType: 'system' },
  })

  const map: Record<string, string> = {}
  for (const folder of folders) {
    map[folder.name] = folder.id
  }
  return map
}

async function upsertDocument(
  brandId: string,
  folderId: string | undefined,
  title: string,
  documentType: string,
  sourceIds: string[],
  icon: string,
  orderIndex: number,
  prisma: PrismaClient,
  content?: string // NEW: optional markdown content
): Promise<boolean> {
  if (!folderId || sourceIds.length === 0) return false

  const existing = await prisma.knowledgeDocument.findFirst({
    where: { brandId, folderId, title },
  })

  if (existing) {
    await prisma.knowledgeDocument.update({
      where: { id: existing.id },
      data: {
        content: content || existing.content, // Update content if provided
        sourceIds: JSON.stringify(sourceIds),
        updatedAt: new Date(),
      },
    })
  } else {
    await prisma.knowledgeDocument.create({
      data: {
        brandId,
        folderId,
        title,
        documentType,
        content: content || null, // Store content if provided
        sourceIds: JSON.stringify(sourceIds),
        isAutoGenerated: true,
        icon,
        orderIndex,
      },
    })
  }

  return true
}

// --- Influencer Notes Document ---

async function generateInfluencerNotesDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  sentiment: string,
  orderIndex: number
): Promise<boolean> {
  const notes = await prisma.influencerNote.findMany({
    where: {
      brandId,
      sentiment,
      confidence: { in: ['medium', 'high'] },
    },
    include: {
      influencer: {
        select: {
          name: true,
          platform: true,
          totalCampaigns: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  // Generate markdown content summary
  let content = `# ${title}\n\n`
  content += `_Last updated: ${new Date().toLocaleDateString()}_\n\n`
  content += `Found ${notes.length} ${sentiment} notes from campaign history.\n\n`

  if (notes.length > 0) {
    content += '---\n\n'
    for (const note of notes.slice(0, 20)) {
      // Limit to first 20 for readability
      content += `### ${note.influencer.name}\n`
      if (note.influencer.platform) {
        content += `**Platform:** ${note.influencer.platform} | `
      }
      content += `**Campaigns:** ${note.influencer.totalCampaigns}\n\n`
      content += `**${note.noteType.replace(/_/g, ' ')}:** ${note.content}\n\n`
      content += `_Confidence: ${note.confidence}${note.year ? ` | Year: ${note.year}` : ''}_\n\n`
      content += '---\n\n'
    }
    if (notes.length > 20) {
      content += `_... and ${notes.length - 20} more notes_\n`
    }
  } else {
    content += `No ${sentiment} notes found yet. Notes will appear here as campaigns are tracked.\n`
  }

  return upsertDocument(
    brandId,
    folderId,
    title,
    'influencer_notes',
    notes.map((n) => n.id),
    sentiment === 'positive' ? 'star' : 'alert-triangle',
    orderIndex,
    prisma,
    content // Pass generated markdown content
  )
}

// --- Platform Influencers Document ---

async function generatePlatformInfluencersDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  platform: string,
  orderIndex: number
): Promise<boolean> {
  // Query from campaign records to capture ALL platforms creators worked on
  // (not just their primary platform)
  const campaignRecords = await prisma.campaignRecord.findMany({
    where: {
      brandId,
      platform: { contains: platform }, // Match platform name
      influencerName: { not: null },
    },
    select: {
      influencerName: true,
    },
    distinct: ['influencerName'],
  })

  // Get unique influencer names
  const influencerNames = campaignRecords
    .map(r => r.influencerName)
    .filter((name): name is string => name !== null)

  // Fetch full influencer details
  const influencers = await prisma.brandInfluencer.findMany({
    where: {
      brandId,
      name: { in: influencerNames },
    },
    orderBy: { totalCampaigns: 'desc' },
    take: 50,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'influencer_list',
    influencers.map((i) => i.id),
    'users',
    orderIndex,
    prisma
  )
}

// --- Campaign Insight Collection ---

async function generateInsightCollectionDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  category: string,
  orderIndex: number
): Promise<boolean> {
  const insights = await prisma.campaignInsight.findMany({
    where: {
      brandId,
      category,
      confidence: { in: ['medium', 'high'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'insight_collection',
    insights.map((i) => i.id),
    'lightbulb',
    orderIndex,
    prisma
  )
}

// --- Brand Learnings Document ---

async function generateLearningsDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  orderIndex: number
): Promise<boolean> {
  const learnings = await prisma.brandLearning.findMany({
    where: {
      brandId,
      status: 'active',
    },
    orderBy: { priority: 'desc' },
    take: 30,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'learning_collection',
    learnings.map((l) => l.id),
    'book',
    orderIndex,
    prisma
  )
}

// --- Trends Document ---

async function generateTrendsDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  status: string,
  orderIndex: number
): Promise<boolean> {
  const trends = await prisma.trendAnalysis.findMany({
    where: { brandId, status },
    orderBy: { detectedAt: 'desc' },
    take: 20,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'trend_report',
    trends.map((t) => t.id),
    'trending-up',
    orderIndex,
    prisma
  )
}

// --- Recommendations Document ---

async function generateRecommendationsDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  status: string,
  orderIndex: number
): Promise<boolean> {
  const recs = await prisma.strategicRecommendation.findMany({
    where: { brandId, status },
    orderBy: { priority: 'desc' },
    take: 20,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'recommendation_list',
    recs.map((r) => r.id),
    status === 'pending' ? 'clipboard' : 'check-circle',
    orderIndex,
    prisma
  )
}

// --- SOW/Contracts Document ---

async function generateSOWDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  orderIndex: number
): Promise<boolean> {
  const sows = await prisma.campaignRecord.findMany({
    where: { brandId, recordType: 'sow' },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'sow_collection',
    sows.map((s) => s.id),
    'file-text',
    orderIndex,
    prisma
  )
}

// --- Slack Document ---

async function generateSlackDocument(
  brandId: string,
  prisma: PrismaClient,
  folderId: string | undefined,
  title: string,
  orderIndex: number
): Promise<boolean> {
  const messages = await prisma.slackMessage.findMany({
    where: { brandId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return upsertDocument(
    brandId,
    folderId,
    title,
    'slack_context',
    messages.map((m) => m.id),
    'message-square',
    orderIndex,
    prisma
  )
}

// ============================================================================
// DOCUMENT DATA RETRIEVAL
// ============================================================================

export async function getDocumentWithData(
  documentId: string,
  prisma: PrismaClient
): Promise<any | null> {
  const document = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
    include: { folder: true },
  })

  if (!document) return null

  let sourceData: any = null

  if (document.sourceIds) {
    const ids = JSON.parse(document.sourceIds)

    switch (document.documentType) {
      case 'influencer_notes':
        sourceData = await prisma.influencerNote.findMany({
          where: { id: { in: ids } },
          include: { influencer: true },
          orderBy: { createdAt: 'desc' },
        })
        break

      case 'influencer_list':
        sourceData = await prisma.brandInfluencer.findMany({
          where: { id: { in: ids } },
          orderBy: { totalCampaigns: 'desc' },
        })
        break

      case 'insight_collection':
        sourceData = await prisma.campaignInsight.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: 'desc' },
        })
        break

      case 'learning_collection':
        sourceData = await prisma.brandLearning.findMany({
          where: { id: { in: ids } },
          orderBy: { priority: 'desc' },
        })
        break

      case 'trend_report':
        sourceData = await prisma.trendAnalysis.findMany({
          where: { id: { in: ids } },
          orderBy: { detectedAt: 'desc' },
        })
        break

      case 'recommendation_list':
        sourceData = await prisma.strategicRecommendation.findMany({
          where: { id: { in: ids } },
          orderBy: { priority: 'desc' },
        })
        break

      case 'sow_collection':
        sourceData = await prisma.campaignRecord.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: 'desc' },
        })
        break

      case 'slack_context':
        sourceData = await prisma.slackMessage.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: 'desc' },
        })
        break

      default:
        sourceData = null
    }
  }

  return {
    ...document,
    sourceData,
  }
}

// ============================================================================
// CUSTOM FOLDER/DOCUMENT CREATION
// ============================================================================

export async function createCustomFolder(
  brandId: string,
  name: string,
  parentId: string | null,
  prisma: PrismaClient
): Promise<any> {
  // Get max orderIndex at this level
  const maxOrder = await prisma.knowledgeFolder.aggregate({
    where: { brandId, parentId },
    _max: { orderIndex: true },
  })

  return prisma.knowledgeFolder.create({
    data: {
      brandId,
      name,
      parentId,
      icon: 'folder',
      folderType: 'custom',
      orderIndex: (maxOrder._max.orderIndex || 0) + 1,
    },
  })
}

export async function createCustomDocument(
  brandId: string,
  folderId: string | null,
  title: string,
  content: string,
  prisma: PrismaClient
): Promise<any> {
  // Get max orderIndex in this folder
  const maxOrder = await prisma.knowledgeDocument.aggregate({
    where: { brandId, folderId },
    _max: { orderIndex: true },
  })

  return prisma.knowledgeDocument.create({
    data: {
      brandId,
      folderId,
      title,
      content,
      documentType: 'manual',
      isAutoGenerated: false,
      icon: 'file-text',
      orderIndex: (maxOrder._max.orderIndex || 0) + 1,
    },
  })
}

export async function updateDocument(
  documentId: string,
  updates: { title?: string; content?: string; tags?: string },
  prisma: PrismaClient
): Promise<any> {
  return prisma.knowledgeDocument.update({
    where: { id: documentId },
    data: updates,
  })
}

export async function deleteFolder(
  folderId: string,
  prisma: PrismaClient
): Promise<boolean> {
  const folder = await prisma.knowledgeFolder.findUnique({
    where: { id: folderId },
  })

  if (!folder || folder.folderType === 'system') {
    return false // Can't delete system folders
  }

  await prisma.knowledgeFolder.delete({
    where: { id: folderId },
  })

  return true
}

export async function deleteDocument(
  documentId: string,
  prisma: PrismaClient
): Promise<boolean> {
  const doc = await prisma.knowledgeDocument.findUnique({
    where: { id: documentId },
  })

  if (!doc || doc.isAutoGenerated) {
    return false // Can't delete auto-generated docs
  }

  await prisma.knowledgeDocument.delete({
    where: { id: documentId },
  })

  return true
}
