'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertCircle } from 'lucide-react'
import KnowledgeTreeNav from './KnowledgeTreeNav'
import DocumentViewer from './DocumentViewer'

interface KnowledgeBaseProps {
  brandId: string
}

export default function KnowledgeBase({ brandId }: KnowledgeBaseProps) {
  const [folders, setFolders] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Load knowledge structure
  const loadKnowledgeStructure = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/brands/${brandId}/knowledge`)
      if (!res.ok) throw new Error('Failed to load knowledge structure')
      const data = await res.json()
      setFolders(data.folders || [])
      setStats(data.stats)
    } catch (err: any) {
      setError(err.message)
      console.error('Failed to load knowledge structure:', err)
    } finally {
      setLoading(false)
    }
  }, [brandId])

  // Load document content
  const loadDocument = useCallback(
    async (docId: string) => {
      try {
        setDocLoading(true)
        const res = await fetch(
          `/api/brands/${brandId}/knowledge/documents/${docId}`
        )
        if (!res.ok) throw new Error('Failed to load document')
        const data = await res.json()
        setSelectedDocument(data)
      } catch (err) {
        console.error('Failed to load document:', err)
        setSelectedDocument(null)
      } finally {
        setDocLoading(false)
      }
    },
    [brandId]
  )

  // Generate knowledge structure
  const generateStructure = async () => {
    try {
      setGenerating(true)
      const res = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      })
      if (!res.ok) throw new Error('Failed to generate structure')
      await loadKnowledgeStructure()
    } catch (err) {
      console.error('Failed to generate structure:', err)
    } finally {
      setGenerating(false)
    }
  }

  // Create custom folder
  const createFolder = async () => {
    const name = prompt('Enter folder name:')
    if (!name) return

    try {
      const res = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createFolder', name }),
      })
      if (!res.ok) throw new Error('Failed to create folder')
      await loadKnowledgeStructure()
    } catch (err) {
      console.error('Failed to create folder:', err)
    }
  }

  // Create custom document
  const createDocument = async () => {
    const title = prompt('Enter document title:')
    if (!title) return

    try {
      const res = await fetch(`/api/brands/${brandId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createDocument', title }),
      })
      if (!res.ok) throw new Error('Failed to create document')
      const newDoc = await res.json()
      await loadKnowledgeStructure()
      setSelectedDocId(newDoc.id)
    } catch (err) {
      console.error('Failed to create document:', err)
    }
  }

  // Initial load
  useEffect(() => {
    loadKnowledgeStructure()
  }, [loadKnowledgeStructure])

  // Load document when selected
  useEffect(() => {
    if (selectedDocId) {
      loadDocument(selectedDocId)
    } else {
      setSelectedDocument(null)
    }
  }, [selectedDocId, loadDocument])

  // Handle document selection
  const handleSelectDoc = (docId: string) => {
    setSelectedDocId(docId)
  }

  if (loading) {
    return (
      <div className="h-[600px] flex items-center justify-center text-stone-500">
        <RefreshCw className="h-5 w-5 animate-spin mr-2" />
        Loading knowledge base...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-[600px] flex flex-col items-center justify-center text-red-500">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>{error}</p>
        <button
          onClick={loadKnowledgeStructure}
          className="mt-3 px-4 py-2 bg-stone-100 hover:bg-stone-200 rounded-md text-stone-700 text-sm"
        >
          Retry
        </button>
      </div>
    )
  }

  // Empty state - no folders yet
  if (folders.length === 0) {
    return (
      <div className="h-[600px] flex flex-col items-center justify-center bg-stone-50 rounded-lg border border-stone-200">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-semibold text-stone-900 mb-2">
            No Knowledge Base Yet
          </h3>
          <p className="text-sm text-stone-600 mb-6">
            Generate a knowledge structure to organize insights, learnings, and
            recommendations from your campaign data.
          </p>
          <button
            onClick={generateStructure}
            disabled={generating}
            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-md text-sm font-medium transition-colors flex items-center gap-2 mx-auto"
          >
            {generating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>Generate Knowledge Base</>
            )}
          </button>
          <p className="text-xs text-stone-500 mt-4">
            This will create folders and documents from your synced campaign
            trackers.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[600px] flex border border-stone-200 rounded-lg overflow-hidden bg-white">
      {/* Left: Tree Navigation (30%) */}
      <div className="w-[320px] flex-shrink-0 border-r border-stone-200">
        <KnowledgeTreeNav
          folders={folders}
          selectedDocId={selectedDocId}
          onSelectDoc={handleSelectDoc}
          onCreateFolder={createFolder}
          onCreateDocument={createDocument}
        />
      </div>

      {/* Right: Document Viewer (70%) */}
      <div className="flex-1 min-w-0">
        <DocumentViewer
          document={selectedDocument}
          loading={docLoading}
          onEdit={() => {
            // TODO: Implement edit modal
            alert('Edit functionality coming soon!')
          }}
          onDelete={async () => {
            if (!selectedDocId) return
            if (!confirm('Delete this document?')) return
            try {
              const res = await fetch(
                `/api/brands/${brandId}/knowledge/documents/${selectedDocId}`,
                { method: 'DELETE' }
              )
              if (res.ok) {
                setSelectedDocId(null)
                setSelectedDocument(null)
                await loadKnowledgeStructure()
              }
            } catch (err) {
              console.error('Failed to delete:', err)
            }
          }}
        />
      </div>
      </div>
    </div>
  )
}
