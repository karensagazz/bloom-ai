import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import mammoth from 'mammoth'
import { importMeetingDocument, extractDateFromFilename } from '@/lib/meeting-importer'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Supported file types for knowledge documents
const SUPPORTED_TYPES = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
} as const

// Detect if filename suggests this is a meeting document
function isMeetingDocument(filename: string): boolean {
  const lowerName = filename.toLowerCase()
  const meetingKeywords = ['meeting', 'standup', 'sync', 'retrospective', 'retro', 'notes', 'minutes', 'agenda']

  // Check for meeting keywords in filename
  if (meetingKeywords.some(keyword => lowerName.includes(keyword))) {
    return true
  }

  // Check if filename has a date pattern (likely a meeting)
  if (extractDateFromFilename(filename) !== null) {
    return true
  }

  return false
}

/**
 * POST /api/brands/[id]/knowledge/upload
 * Upload industry knowledge documents (PDF, TXT, MD, CSV)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const brandId = params.id

    // Verify brand exists
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
    })

    if (!brand) {
      return NextResponse.json(
        { error: 'Brand not found' },
        { status: 404 }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Validate file type - check both MIME type and file extension
    let fileType = SUPPORTED_TYPES[file.type as keyof typeof SUPPORTED_TYPES]

    // Fallback to extension-based detection
    if (!fileType) {
      const fileName = file.name.toLowerCase()
      if (fileName.endsWith('.md') || fileName.endsWith('.markdown')) {
        fileType = 'md'
      } else if (fileName.endsWith('.txt')) {
        fileType = 'txt'
      } else if (fileName.endsWith('.pdf')) {
        fileType = 'pdf'
      } else if (fileName.endsWith('.csv')) {
        fileType = 'csv'
      } else if (fileName.endsWith('.docx')) {
        fileType = 'docx'
      }
    }

    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Supported: PDF, DOCX, TXT, MD, CSV` },
        { status: 400 }
      )
    }

    // Validate file size (32MB limit for Claude API)
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > 32) {
      return NextResponse.json(
        { error: `File too large (${sizeMB.toFixed(1)}MB). Maximum size is 32MB.` },
        { status: 400 }
      )
    }

    console.log(`[Knowledge Upload] Processing ${file.name} (${fileType}) for brand: ${brand.name}`)

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Check if this is a meeting document (DOCX or PDF with meeting keywords/dates)
    if ((fileType === 'docx' || fileType === 'pdf') && isMeetingDocument(file.name)) {
      console.log(`[Knowledge Upload] Detected meeting document, routing to meeting importer`)

      try {
        const documentId = await importMeetingDocument(
          brandId,
          buffer,
          file.name,
          fileType as 'pdf' | 'docx',
          prisma
        )

        return NextResponse.json({
          success: true,
          documentId,
          type: 'meeting',
          message: `Successfully imported meeting: ${file.name}`,
        })
      } catch (error) {
        console.error('[Knowledge Upload] Meeting import failed:', error)
        throw error
      }
    }

    // Extract content based on file type
    let extractedContent: string
    let extractedSummary: string

    if (fileType === 'pdf') {
      // Use Claude's document understanding for PDFs
      const base64Data = buffer.toString('base64')
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: base64Data,
                },
              },
              {
                type: 'text',
                text: `Extract and summarize the key knowledge from this document for an influencer marketing team.

This is industry knowledge that will help inform campaign strategy and creator recommendations.

Return a JSON object with:
{
  "summary": "A 2-3 sentence summary of what this document covers",
  "content": "The full extracted text content, organized with markdown headers where appropriate",
  "topics": ["list", "of", "key", "topics"],
  "relevance": "How this knowledge applies to influencer marketing"
}

Return ONLY valid JSON, no markdown code blocks.`,
              },
            ],
          },
        ],
      })

      const textContent = response.content[0]
      if (textContent.type !== 'text') {
        throw new Error('Unexpected response from Claude')
      }

      const parsed = JSON.parse(textContent.text)
      extractedContent = parsed.content || textContent.text
      extractedSummary = parsed.summary || 'Uploaded industry knowledge document'
    } else if (fileType === 'docx') {
      // For DOCX files, use mammoth to extract text
      const result = await mammoth.extractRawText({ buffer })
      const textContent = result.value

      // Generate a summary using Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `Summarize this document in 2-3 sentences for an influencer marketing team:\n\n${textContent.slice(0, 10000)}`,
          },
        ],
      })

      const summaryContent = response.content[0]
      extractedContent = textContent
      extractedSummary = summaryContent.type === 'text'
        ? summaryContent.text
        : 'Uploaded industry knowledge document'
    } else {
      // For text-based files (TXT, MD, CSV), read directly
      const textContent = buffer.toString('utf-8')

      // Generate a summary using Claude
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: `Summarize this document in 2-3 sentences for an influencer marketing team:\n\n${textContent.slice(0, 10000)}`,
          },
        ],
      })

      const summaryContent = response.content[0]
      extractedContent = textContent
      extractedSummary = summaryContent.type === 'text'
        ? summaryContent.text
        : 'Uploaded industry knowledge document'
    }

    // Find or create the "Industry Knowledge" folder
    let industryFolder = await prisma.knowledgeFolder.findFirst({
      where: {
        brandId,
        name: 'Industry Knowledge',
        folderType: 'system',
      },
    })

    if (!industryFolder) {
      industryFolder = await prisma.knowledgeFolder.create({
        data: {
          brandId,
          name: 'Industry Knowledge',
          icon: 'book-open',
          folderType: 'system',
          orderIndex: 5,
        },
      })
    }

    // Create the knowledge document
    const document = await prisma.knowledgeDocument.create({
      data: {
        brandId,
        folderId: industryFolder.id,
        title: file.name.replace(/\.[^/.]+$/, ''), // Remove file extension
        content: extractedContent,
        documentType: 'manual',
        icon: fileType === 'pdf' ? 'file-text' : 'file',
        isAutoGenerated: false,
        tags: JSON.stringify(['industry-knowledge', fileType]),
        orderIndex: 0,
      },
    })

    console.log(`[Knowledge Upload] Successfully created document: ${document.id}`)

    return NextResponse.json({
      success: true,
      documentId: document.id,
      folderId: industryFolder.id,
      summary: extractedSummary,
      message: `Successfully uploaded ${file.name}`,
    })
  } catch (error) {
    console.error('[Knowledge Upload] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to upload file'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
