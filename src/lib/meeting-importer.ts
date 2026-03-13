// Meeting Document Importer
// Handles DOCX and PDF meeting notes with automatic date extraction and folder organization

import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient } from '@prisma/client'
import mammoth from 'mammoth'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Extracted meeting context
export interface ExtractedMeetingContext {
  meetingDate?: string
  participants?: string[]
  topics?: string[]
  actionItems?: string[]
  decisions?: string[]
  nextSteps?: string[]
  rawSummary: string
  fullContent: string
}

/**
 * Extract date from filename
 * Supports formats:
 * - YYYY-MM-DD (2026-03-15)
 * - MM-DD-YYYY (03-15-2026)
 * - YYYY_MM_DD (2026_03_15)
 * - MMM-DD-YYYY (Mar-15-2026)
 * - Meeting-YYYY-MM-DD
 * - YYYY-MM-DD-meeting-notes
 */
export function extractDateFromFilename(filename: string): Date | null {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

  // Try different date patterns
  const patterns = [
    /(\d{4})-(\d{2})-(\d{2})/, // YYYY-MM-DD
    /(\d{4})_(\d{2})_(\d{2})/, // YYYY_MM_DD
    /(\d{2})-(\d{2})-(\d{4})/, // MM-DD-YYYY
    /(\d{2})_(\d{2})_(\d{4})/, // MM_DD_YYYY
    /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_](\d{1,2})[-_](\d{4})/i, // MMM-DD-YYYY
  ]

  for (const pattern of patterns) {
    const match = nameWithoutExt.match(pattern)
    if (match) {
      // Check if it's YYYY-MM-DD or MM-DD-YYYY format
      if (match[1].length === 4) {
        // YYYY-MM-DD format
        const year = parseInt(match[1])
        const month = parseInt(match[2]) - 1
        const day = parseInt(match[3])
        const date = new Date(year, month, day)
        if (!isNaN(date.getTime())) {
          return date
        }
      } else if (match[3]?.length === 4) {
        // MM-DD-YYYY format
        const month = parseInt(match[1]) - 1
        const day = parseInt(match[2])
        const year = parseInt(match[3])
        const date = new Date(year, month, day)
        if (!isNaN(date.getTime())) {
          return date
        }
      } else if (typeof match[1] === 'string' && isNaN(parseInt(match[1]))) {
        // Month name format (e.g., Mar-15-2026)
        const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
        const monthIndex = monthNames.indexOf(match[1].toLowerCase().slice(0, 3))
        if (monthIndex !== -1) {
          const day = parseInt(match[2])
          const year = parseInt(match[3])
          const date = new Date(year, monthIndex, day)
          if (!isNaN(date.getTime())) {
            return date
          }
        }
      }
    }
  }

  return null
}

/**
 * Format date for folder name (e.g., "2026-03-15" or "March 2026")
 */
export function formatDateForFolder(date: Date, groupBy: 'day' | 'month' = 'month'): string {
  if (groupBy === 'day') {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  } else {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December']
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`
  }
}

/**
 * Extract text content from DOCX file
 */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (error) {
    console.error('[Meeting Import] Failed to extract DOCX text:', error)
    throw new Error('Failed to read DOCX file')
  }
}

/**
 * Extract text content from PDF using Claude
 */
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const base64Data = buffer.toString('base64')
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
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
            text: 'Extract all text content from this PDF. Return ONLY the raw text, no formatting or markdown.',
          },
        ],
      },
    ],
  })

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )

  if (!textBlock) {
    throw new Error('No text response from Claude')
  }

  return textBlock.text
}

/**
 * Analyze meeting content and extract structured information using Claude
 */
async function analyzeMeetingContent(content: string): Promise<ExtractedMeetingContext> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: `Analyze this meeting document and extract structured information.

Meeting content:
${content}

Return ONLY valid JSON with this structure:

{
  "meetingDate": "YYYY-MM-DD format if mentioned in content, otherwise null",
  "participants": ["person1", "person2"],
  "topics": ["topic1", "topic2"],
  "actionItems": ["action1", "action2"],
  "decisions": ["decision1", "decision2"],
  "nextSteps": ["step1", "step2"],
  "rawSummary": "2-3 sentence summary of the meeting",
  "fullContent": "cleaned and formatted full meeting content with markdown headers"
}

IMPORTANT RULES:
1. If a field doesn't have clear information, use null or empty array
2. Extract exact quotes for action items and decisions
3. Be specific and actionable
4. Return ONLY valid JSON - no markdown, no explanations`,
      },
    ],
  })

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text'
  )

  if (!textBlock) {
    throw new Error('No text response from Claude')
  }

  try {
    // Remove markdown code blocks if present
    const jsonText = textBlock.text.replace(/```json\n?|\n?```/g, '').trim()
    return JSON.parse(jsonText)
  } catch (parseError) {
    console.error('[Meeting Import] Failed to parse Claude response:', textBlock.text)
    throw new Error('Failed to parse meeting analysis from Claude')
  }
}

/**
 * Import a meeting document (DOCX or PDF) with automatic date extraction and folder organization
 */
export async function importMeetingDocument(
  brandId: string,
  fileBuffer: Buffer,
  filename: string,
  fileType: 'pdf' | 'docx',
  prisma: PrismaClient
): Promise<string> {
  console.log(`[Meeting Import] Processing ${filename} (${fileType}) for brand ${brandId}`)

  // Validate file size (Claude has 32MB limit for PDFs)
  const sizeMB = fileBuffer.length / (1024 * 1024)
  if (sizeMB > 32) {
    throw new Error(`File too large (${sizeMB.toFixed(1)}MB). Maximum size is 32MB.`)
  }

  try {
    // Extract text content based on file type
    let textContent: string
    if (fileType === 'docx') {
      textContent = await extractTextFromDocx(fileBuffer)
    } else {
      textContent = await extractTextFromPdf(fileBuffer)
    }

    console.log(`[Meeting Import] Extracted ${textContent.length} characters of text`)

    // Analyze meeting content
    const analyzed = await analyzeMeetingContent(textContent)

    console.log('[Meeting Import] Successfully analyzed meeting content')
    console.log(`  - Topics: ${analyzed.topics?.length || 0}`)
    console.log(`  - Action Items: ${analyzed.actionItems?.length || 0}`)
    console.log(`  - Decisions: ${analyzed.decisions?.length || 0}`)

    // Extract date from filename first, fallback to date in content
    let meetingDate = extractDateFromFilename(filename)
    if (!meetingDate && analyzed.meetingDate) {
      meetingDate = new Date(analyzed.meetingDate)
    }

    // Find or create "Meetings" root folder
    let meetingsRootFolder = await prisma.knowledgeFolder.findFirst({
      where: {
        brandId,
        name: 'Meetings',
        parentId: null,
      },
    })

    if (!meetingsRootFolder) {
      console.log('[Meeting Import] Creating "Meetings" root folder')
      meetingsRootFolder = await prisma.knowledgeFolder.create({
        data: {
          brandId,
          name: 'Meetings',
          description: 'Meeting notes and recordings organized by date',
          icon: 'calendar',
          folderType: 'custom',
          orderIndex: 0,
        },
      })
    }

    // Create or find date-based subfolder if we have a date
    let targetFolderId = meetingsRootFolder.id
    if (meetingDate) {
      const folderName = formatDateForFolder(meetingDate, 'month')
      let dateFolder = await prisma.knowledgeFolder.findFirst({
        where: {
          brandId,
          name: folderName,
          parentId: meetingsRootFolder.id,
        },
      })

      if (!dateFolder) {
        console.log(`[Meeting Import] Creating "${folderName}" subfolder`)
        dateFolder = await prisma.knowledgeFolder.create({
          data: {
            brandId,
            name: folderName,
            description: `Meetings from ${folderName}`,
            icon: 'folder',
            folderType: 'custom',
            parentId: meetingsRootFolder.id,
            orderIndex: -meetingDate.getTime(), // Reverse chronological
          },
        })
      }

      targetFolderId = dateFolder.id
    }

    // Create knowledge document with extracted content
    const document = await prisma.knowledgeDocument.create({
      data: {
        brandId,
        folderId: targetFolderId,
        title: filename.replace(/\.[^/.]+$/, ''), // Remove extension
        content: analyzed.fullContent,
        documentType: 'manual',
        isAutoGenerated: false,
        icon: fileType === 'docx' ? 'file-text' : 'file-pdf',
        tags: JSON.stringify([
          'meeting',
          fileType,
          ...(meetingDate ? [formatDateForFolder(meetingDate, 'day')] : []),
          ...(analyzed.topics || []),
        ]),
      },
    })

    console.log(`[Meeting Import] Created document ${document.id} in folder`)

    return document.id
  } catch (error) {
    console.error('[Meeting Import] Error processing meeting document:', error)
    throw error
  }
}
