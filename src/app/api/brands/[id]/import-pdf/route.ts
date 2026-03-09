import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { importBrandPDF } from '@/lib/pdf-importer'

/**
 * POST /api/brands/[id]/import-pdf
 * Import a PDF brand brief and extract context
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

    // Validate file type
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'File must be a PDF' },
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

    console.log(`[API] Importing PDF: ${file.name} (${sizeMB.toFixed(2)}MB) for brand: ${brand.name}`)

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Import PDF and extract context
    const documentId = await importBrandPDF(brandId, buffer, file.name, prisma)

    console.log(`[API] Successfully imported PDF, document ID: ${documentId}`)

    return NextResponse.json({
      success: true,
      documentId,
      message: `Successfully imported ${file.name}`,
    })
  } catch (error) {
    console.error('[API] PDF import error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to import PDF'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
