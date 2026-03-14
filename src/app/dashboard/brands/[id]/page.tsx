'use client'

import Link from 'next/link'
import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  RefreshCw,
  FileSpreadsheet,
  MessageSquare,
  Globe,
  Trash2,
  ExternalLink,
  Settings,
  Lightbulb,
  Users,
  TrendingUp,
  X,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatDistanceToNow } from 'date-fns'
import KnowledgeBase from '@/components/knowledge/KnowledgeBase'

interface BrandIntelligence {
  summary: string
  primaryPlatforms: string[]
  typicalBudgetRange: string
  contentTypes: string[]
  keyInsights: string[]
  totalCampaignsAnalyzed: number
  totalCampaigns: number
  activeInfluencerCount: number
  yearsOfData: number[]
  platformBreakdown?: Record<string, number>
  statusBreakdown?: Record<string, number>
}

// Helper function to parse deal value from various formats
function parseDealValue(value: string | null): number {
  if (!value) return 0
  const cleaned = value.replace(/[$,]/g, '').toLowerCase().trim()
  // Handle "5k" or "5K" format
  const kMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*k/)
  if (kMatch) return parseFloat(kMatch[1]) * 1000
  // Handle regular numbers
  const numMatch = cleaned.match(/\d+(?:\.\d+)?/)
  return numMatch ? parseFloat(numMatch[0]) : 0
}

// Format currency for display
function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

// Calculate contract term duration
function getContractTerm(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const startDate = new Date(start)
  const endDate = new Date(end)
  const diffMonths = Math.round(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
  )

  if (diffMonths < 1) return 'Less than 1 month'
  if (diffMonths === 1) return '1 month'
  return `${diffMonths} months`
}

// Format contract dates for display
function formatContractDates(start: string | null, end: string | null): string {
  if (!start || !end) return '—'
  const startDate = new Date(start)
  const endDate = new Date(end)
  const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' })
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`
}

// Parse and format deliverables from JSON
function formatDeliverables(deliverablesJson: string | null): string {
  if (!deliverablesJson) return '—'

  try {
    const deliverables = JSON.parse(deliverablesJson)
    if (!Array.isArray(deliverables) || deliverables.length === 0) return '—'

    return deliverables
      .map((d: any) => {
        const quantity = d.quantity || 1
        const type = d.type || 'item'
        return `${quantity} ${type}${quantity > 1 ? 's' : ''}`
      })
      .join(', ')
  } catch {
    return deliverablesJson  // Return raw if parsing fails
  }
}

// Get handle by looking up influencer
function getInfluencerHandle(
  influencerName: string | null,
  influencers: any[]
): string | null {
  if (!influencerName) return null

  const influencer = influencers.find(
    i => i.name.toLowerCase() === influencerName.toLowerCase()
  )

  return influencer?.handle || null
}

interface CampaignTracker {
  id: string
  spreadsheetUrl: string
  spreadsheetId: string
  label: string | null
  year: number | null
  syncStatus: string
  lastSyncedAt: string | null
  errorMessage: string | null
  _count: {
    tabs: number
    campaignRecords: number
  }
  tabs: Array<{
    id: string
    tabName: string
    rowCount: number
  }>
}

interface BrandInfluencer {
  id: string
  name: string
  handle: string | null
  platform: string | null
  email: string | null
  estimatedRate: string | null
  totalCampaigns: number
  notes: string | null
}

interface CampaignRecord {
  id: string
  influencerName: string | null
  campaignName: string | null
  platform: string | null
  contentType: string | null
  dealValue: string | null
  status: string | null
  year: number | null
  quarter: string | null
  tabName: string | null
  recordType: string  // "campaign" | "sow"
}

interface SOWRecord {
  id: string
  influencerName: string | null
  campaignName: string | null
  platform: string | null
  contractType: string | null
  deliverables: string | null  // JSON string
  exclusivity: string | null
  usageRights: string | null
  contractStart: string | null
  contractEnd: string | null
  totalValue: number | null
  dealValue: string | null
  status: string | null
  tabName: string | null
}

interface Brand {
  id: string
  name: string
  website: string | null
  websiteSummary: string | null
  brandIntelligence: string | null
  syncStatus: string
  lastSyncedAt: string | null
  slackChannelId: string | null
  slackChannelName: string | null
  campaignTrackers: CampaignTracker[]
  brandInfluencers: BrandInfluencer[]
  campaignRecords: CampaignRecord[]
  sowRecords: SOWRecord[]
  slackMessages: Array<{
    id: string
    userName: string | null
    content: string
    createdAt: string
  }>
}

export default function BrandDetailPage() {
  const params = useParams()
  const router = useRouter()
  const brandId = params.id as string

  const [brand, setBrand] = useState<Brand | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ progress: number; step: string } | null>(null)

  // Ref to track sync start time for time estimates
  const syncStartTimeRef = useRef<number | null>(null)

  // Ref to prevent double loadBrand() calls during sync completion
  const syncLoadCompletedRef = useRef(false)

  // PDF import
  const [uploadingPdf, setUploadingPdf] = useState(false)

  // Tracker management
  const [showTrackers, setShowTrackers] = useState(false)
  const [showAddTracker, setShowAddTracker] = useState(false)
  const [newTrackerUrl, setNewTrackerUrl] = useState('')
  const [newTrackerLabel, setNewTrackerLabel] = useState('')
  const [newTrackerYear, setNewTrackerYear] = useState('')
  const [addingTracker, setAddingTracker] = useState(false)

  // Tab discovery and selection
  const [discoveringTabs, setDiscoveringTabs] = useState(false)
  const [discoveredTabs, setDiscoveredTabs] = useState<Array<{
    gid: string
    tabName: string
    tabIndex: number
    detectedType: string
    recommended: boolean
  }> | null>(null)
  const [selectedTabGids, setSelectedTabGids] = useState<Set<string>>(new Set())

  // Slack channel editing
  const [editingSlack, setEditingSlack] = useState(false)

  async function loadBrand() {
    try {
      const res = await fetch(`/api/brands/${brandId}`)
      if (res.ok) {
        const data = await res.json()
        setBrand(data)
      } else if (res.status === 404) {
        router.push('/dashboard/brands')
      }
    } catch (e) {
      console.error('Failed to load brand', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBrand()
  }, [brandId])

  // Poll for sync progress while syncing
  useEffect(() => {
    if (!syncing || !brandId) return

    const pollProgress = async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/sync-progress`)
        if (res.ok) {
          const data = await res.json()
          setSyncProgress({ progress: data.progress, step: data.step })
          // Stop polling if sync completed
          if (data.status === 'synced' || data.status === 'error') {
            setSyncing(false)
            setSyncProgress(null)
            // Only load brand if we haven't already (prevents race condition)
            if (!syncLoadCompletedRef.current) {
              syncLoadCompletedRef.current = true
              loadBrand()
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch sync progress', e)
      }
    }

    // Initial poll
    pollProgress()

    // Poll every 1 second
    const interval = setInterval(pollProgress, 1000)
    return () => clearInterval(interval)
  }, [syncing, brandId])

  async function handleSync() {
    // Reset the ref at start of new sync
    syncLoadCompletedRef.current = false
    setSyncing(true)
    syncStartTimeRef.current = Date.now()
    try {
      const response = await fetch(`/api/brands/${brandId}/sync`, { method: 'POST' })

      if (!response.ok) {
        const error = await response.json()
        console.error('Sync failed:', error)
        alert(error.error || `Sync failed: ${response.statusText}`)
        return
      }

      const result = await response.json()
      console.log('Sync completed:', result)
      // Only load brand if polling hasn't already done it (prevents race condition)
      if (!syncLoadCompletedRef.current) {
        syncLoadCompletedRef.current = true
        await loadBrand()
      }
    } catch (e) {
      console.error('Failed to sync', e)
      alert('Network error during sync')
    } finally {
      setSyncing(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Are you sure you want to delete this brand? This cannot be undone.')) {
      return
    }
    setDeleting(true)
    try {
      await fetch(`/api/brands/${brandId}`, { method: 'DELETE' })
      router.push('/dashboard/brands')
    } catch (e) {
      console.error('Failed to delete', e)
      setDeleting(false)
    }
  }

  async function handleAddTracker(e: React.FormEvent) {
    e.preventDefault()
    setAddingTracker(true)
    try {
      const res = await fetch(`/api/brands/${brandId}/trackers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetUrl: newTrackerUrl,
          label: newTrackerLabel || undefined,
          year: newTrackerYear ? parseInt(newTrackerYear) : undefined,
          selectedTabs: selectedTabGids.size > 0 ? Array.from(selectedTabGids) : undefined,
        }),
      })
      if (res.ok) {
        // Reset form
        setNewTrackerUrl('')
        setNewTrackerLabel('')
        setNewTrackerYear('')
        setDiscoveredTabs(null)
        setSelectedTabGids(new Set())
        setShowAddTracker(false)
        await loadBrand()
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to add tracker')
      }
    } catch (e) {
      console.error('Failed to add tracker', e)
      alert('Failed to add tracker')
    } finally {
      setAddingTracker(false)
    }
  }

  async function handleDiscoverTabs() {
    if (!newTrackerUrl) {
      alert('Please enter a Google Sheets URL first')
      return
    }
    setDiscoveringTabs(true)
    try {
      const res = await fetch('/api/sheets/discover-tabs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetUrl: newTrackerUrl }),
      })
      if (res.ok) {
        const data = await res.json()
        setDiscoveredTabs(data.tabs)
        // Pre-select recommended tabs
        const recommended = new Set<string>(
          data.tabs.filter((t: { recommended: boolean; gid: string }) => t.recommended).map((t: { gid: string }) => t.gid)
        )
        setSelectedTabGids(recommended)
      } else {
        const error = await res.json()
        alert(error.error || 'Failed to discover tabs')
      }
    } catch (e) {
      console.error('Failed to discover tabs', e)
      alert('Failed to discover tabs. Make sure the spreadsheet is publicly viewable.')
    } finally {
      setDiscoveringTabs(false)
    }
  }

  function toggleTabSelection(gid: string) {
    setSelectedTabGids(prev => {
      const next = new Set(prev)
      if (next.has(gid)) {
        next.delete(gid)
      } else {
        next.add(gid)
      }
      return next
    })
  }

  function resetAddTrackerForm() {
    setNewTrackerUrl('')
    setNewTrackerLabel('')
    setNewTrackerYear('')
    setDiscoveredTabs(null)
    setSelectedTabGids(new Set())
    setShowAddTracker(false)
  }

  async function handleDeleteTracker(trackerId: string) {
    if (!confirm('Are you sure you want to remove this tracker?')) {
      return
    }
    try {
      await fetch(`/api/brands/${brandId}/trackers/${trackerId}`, { method: 'DELETE' })
      await loadBrand()
    } catch (e) {
      console.error('Failed to delete tracker', e)
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (file.type !== 'application/pdf') {
      alert('Please upload a PDF file')
      return
    }

    // Validate file size (32MB max)
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > 32) {
      alert(`File too large (${sizeMB.toFixed(1)}MB). Maximum size is 32MB.`)
      return
    }

    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/brands/${brandId}/import-pdf`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const result = await res.json()
        alert(`✅ Successfully imported ${file.name}!`)
        await loadBrand() // Reload to show new document
      } else {
        const error = await res.json()
        alert(`❌ ${error.error || 'Failed to import PDF'}`)
      }
    } catch (error) {
      console.error('PDF upload error:', error)
      alert('❌ Network error during upload')
    } finally {
      setUploadingPdf(false)
      // Reset file input
      if (e.target) e.target.value = ''
    }
  }

  async function handleSyncTracker(trackerId: string) {
    try {
      const response = await fetch(`/api/brands/${brandId}/trackers/${trackerId}/sync`, { method: 'POST' })

      if (!response.ok) {
        const error = await response.json()
        console.error('Tracker sync failed:', error)
        alert(error.error || `Sync failed: ${response.statusText}`)
        return
      }

      const result = await response.json()
      console.log('Tracker sync completed:', result)
      await loadBrand()
    } catch (e) {
      console.error('Failed to sync tracker', e)
      alert('Network error during tracker sync')
    }
  }

  // Parse brand intelligence
  const intelligence: BrandIntelligence | null = brand?.brandIntelligence
    ? JSON.parse(brand.brandIntelligence)
    : null

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="text-xl font-semibold text-stone-900">Bloom</span>
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link href="/dashboard" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Dashboard
              </Link>
              <Link href="/dashboard/brands" className="text-sm font-medium text-stone-900">
                Brands
              </Link>
              {/* HIDDEN: Creators navigation
              <Link href="/dashboard/creators" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Creators
              </Link>
              */}
              <Link href="/dashboard/settings" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Settings
              </Link>
            </nav>
          </div>
          <Link href="/dashboard/settings">
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/dashboard/brands"
          className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Brands
        </Link>

        {loading ? (
          <div className="text-center py-12 text-stone-500">Loading brand...</div>
        ) : !brand ? (
          <div className="text-center py-12 text-stone-500">Brand not found</div>
        ) : (
          <>
            {/* Brand Header */}
            <div className="bg-white border border-stone-200 rounded-lg p-6 mb-6">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-stone-900">{brand.name}</h1>

                  <div className="flex items-center gap-4 mt-3 text-sm text-stone-600">
                    {brand.website && (
                      <a
                        href={brand.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-stone-900"
                      >
                        <Globe className="h-4 w-4" />
                        <span>Website</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}

                    {brand.slackChannelName && (
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        #{brand.slackChannelName}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-1">
                      <FileSpreadsheet className="h-4 w-4" />
                      {brand.campaignTrackers.length} tracker{brand.campaignTrackers.length !== 1 ? 's' : ''}
                    </span>

                    <span className="inline-flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {brand.brandInfluencers.length} influencer{brand.brandInfluencers.length !== 1 ? 's' : ''}
                    </span>

                    <span className="inline-flex items-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      {brand.campaignRecords.length} campaign{brand.campaignRecords.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        brand.syncStatus === 'synced'
                          ? 'bg-green-100 text-green-800'
                          : brand.syncStatus === 'syncing'
                          ? 'bg-blue-100 text-blue-800'
                          : brand.syncStatus === 'error'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {brand.syncStatus}
                    </span>
                    {brand.lastSyncedAt && !syncing && (
                      <span className="text-xs text-stone-500">
                        Last synced {formatDistanceToNow(new Date(brand.lastSyncedAt))} ago
                      </span>
                    )}
                  </div>

                  {/* Sync Progress Bar */}
                  {syncing && syncProgress && (
                    <div className="mt-3 w-full max-w-md">
                      <div className="flex justify-between text-xs text-stone-600 mb-1">
                        <span className="truncate max-w-xs">{syncProgress.step}</span>
                        <span className="ml-2 shrink-0 text-stone-500">
                          {syncProgress.progress}%
                          {syncStartTimeRef.current && syncProgress.progress > 5 && (() => {
                            const elapsed = Date.now() - syncStartTimeRef.current!
                            const totalEstimate = elapsed / (syncProgress.progress / 100)
                            const remaining = Math.max(0, totalEstimate - elapsed)
                            const mins = Math.floor(remaining / 60000)
                            const secs = Math.round((remaining % 60000) / 1000)
                            return mins > 0
                              ? ` · ~${mins}m ${secs}s left`
                              : secs > 5 ? ` · ~${secs}s left` : ' · almost done'
                          })()}
                        </span>
                      </div>
                      <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-stone-800 rounded-full transition-all duration-300"
                          style={{ width: `${syncProgress.progress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Syncing...' : 'Sync All'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Trackers Section */}
            <div className="bg-white border border-stone-200 rounded-lg mb-6">
              {/* Trackers Header - Always visible */}
              <button
                onClick={() => setShowTrackers(!showTrackers)}
                className="w-full flex items-center justify-between p-4 hover:bg-stone-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-stone-500" />
                  <div className="text-left">
                    <h3 className="text-sm font-medium text-stone-900">Campaign Trackers</h3>
                    <p className="text-xs text-stone-500">
                      {brand.campaignTrackers.length === 0
                        ? 'No trackers connected'
                        : `${brand.campaignTrackers.length} tracker${brand.campaignTrackers.length !== 1 ? 's' : ''} connected`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowAddTracker(true)
                      setShowTrackers(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Tracker
                  </Button>
                  {showTrackers ? (
                    <ChevronUp className="h-4 w-4 text-stone-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-stone-400" />
                  )}
                </div>
              </button>

              {/* Trackers List - Collapsible */}
              {showTrackers && (
                <div className="border-t border-stone-200 p-4 space-y-3">
                  {/* Add Tracker Form */}
                  {showAddTracker && (
                    <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 mb-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium text-stone-900">Add Campaign Tracker</h4>
                        <button
                          onClick={resetAddTrackerForm}
                          className="text-stone-400 hover:text-stone-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <form onSubmit={handleAddTracker} className="space-y-3">
                        {/* Step 1: Enter URL */}
                        <div>
                          <Label htmlFor="tracker-url" className="text-xs">Google Sheets URL *</Label>
                          <div className="flex gap-2 mt-1">
                            <Input
                              id="tracker-url"
                              type="url"
                              placeholder="https://docs.google.com/spreadsheets/d/..."
                              value={newTrackerUrl}
                              onChange={(e) => {
                                setNewTrackerUrl(e.target.value)
                                // Reset tabs when URL changes
                                setDiscoveredTabs(null)
                                setSelectedTabGids(new Set())
                              }}
                              required
                              className="text-sm flex-1"
                              disabled={discoveredTabs !== null}
                            />
                            {!discoveredTabs ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handleDiscoverTabs}
                                disabled={!newTrackerUrl || discoveringTabs}
                              >
                                {discoveringTabs ? (
                                  <>
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    Discovering...
                                  </>
                                ) : (
                                  'Discover Tabs'
                                )}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setNewTrackerUrl('')
                                  setDiscoveredTabs(null)
                                  setSelectedTabGids(new Set())
                                }}
                              >
                                Change
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Step 2: Select Tabs */}
                        {discoveredTabs && (
                          <div className="border border-stone-200 rounded-lg bg-white p-3">
                            <div className="flex items-center justify-between mb-2">
                              <Label className="text-xs font-medium">Select tabs to learn from:</Label>
                              <span className="text-xs text-stone-500">
                                {selectedTabGids.size} of {discoveredTabs.length} selected
                              </span>
                            </div>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {discoveredTabs.map((tab) => (
                                <label
                                  key={tab.gid}
                                  className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-stone-50 ${
                                    selectedTabGids.has(tab.gid) ? 'bg-blue-50 border border-blue-200' : 'border border-transparent'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTabGids.has(tab.gid)}
                                    onChange={() => toggleTabSelection(tab.gid)}
                                    className="rounded border-stone-300"
                                  />
                                  <span className="text-sm text-stone-900 flex-1">{tab.tabName}</span>
                                  {tab.detectedType !== 'unknown' && (
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      tab.detectedType === 'campaigns' ? 'bg-green-100 text-green-700' :
                                      tab.detectedType === 'contracts' ? 'bg-blue-100 text-blue-700' :
                                      tab.detectedType === 'influencers' ? 'bg-purple-100 text-purple-700' :
                                      'bg-stone-100 text-stone-600'
                                    }`}>
                                      {tab.detectedType}
                                    </span>
                                  )}
                                </label>
                              ))}
                            </div>
                            {discoveredTabs.length === 0 && (
                              <p className="text-sm text-stone-500 text-center py-4">
                                No tabs found. Make sure the spreadsheet is publicly viewable.
                              </p>
                            )}
                          </div>
                        )}

                        {/* Step 3: Label and Year */}
                        {discoveredTabs && selectedTabGids.size > 0 && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label htmlFor="tracker-label" className="text-xs">Label</Label>
                              <Input
                                id="tracker-label"
                                type="text"
                                placeholder="e.g. 2024 Campaigns"
                                value={newTrackerLabel}
                                onChange={(e) => setNewTrackerLabel(e.target.value)}
                                className="mt-1 text-sm"
                              />
                            </div>
                            <div>
                              <Label htmlFor="tracker-year" className="text-xs">Year</Label>
                              <Input
                                id="tracker-year"
                                type="number"
                                placeholder="e.g. 2024"
                                value={newTrackerYear}
                                onChange={(e) => setNewTrackerYear(e.target.value)}
                                min="2000"
                                max="2100"
                                className="mt-1 text-sm"
                              />
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={resetAddTrackerForm}
                          >
                            Cancel
                          </Button>
                          {discoveredTabs && (
                            <Button
                              type="submit"
                              size="sm"
                              disabled={addingTracker || selectedTabGids.size === 0}
                            >
                              {addingTracker ? (
                                <>
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  Adding...
                                </>
                              ) : (
                                `Add Tracker (${selectedTabGids.size} tab${selectedTabGids.size !== 1 ? 's' : ''})`
                              )}
                            </Button>
                          )}
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Existing Trackers */}
                  {brand.campaignTrackers.length === 0 && !showAddTracker ? (
                    <div className="text-center py-6">
                      <FileSpreadsheet className="h-8 w-8 text-stone-300 mx-auto mb-2" />
                      <p className="text-sm text-stone-500 mb-3">No campaign trackers connected yet.</p>
                      <Button size="sm" onClick={() => setShowAddTracker(true)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Add Your First Tracker
                      </Button>
                    </div>
                  ) : (
                    brand.campaignTrackers.map((tracker) => (
                      <div
                        key={tracker.id}
                        className="flex items-center justify-between bg-white border border-stone-200 rounded-lg p-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm text-stone-900 truncate">
                              {tracker.label || 'Campaign Tracker'}
                            </span>
                            {tracker.year && (
                              <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 text-xs rounded">
                                {tracker.year}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 text-xs rounded ${
                                tracker.syncStatus === 'synced'
                                  ? 'bg-green-100 text-green-700'
                                  : tracker.syncStatus === 'syncing'
                                  ? 'bg-blue-100 text-blue-700'
                                  : tracker.syncStatus === 'error'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-stone-100 text-stone-600'
                              }`}
                            >
                              {tracker.syncStatus}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-stone-500">
                            <a
                              href={tracker.spreadsheetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 flex items-center gap-1 truncate max-w-xs"
                            >
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">Open Sheet</span>
                            </a>
                            <span>{tracker._count.tabs} tabs</span>
                            <span>{tracker._count.campaignRecords} campaigns</span>
                            {tracker.lastSyncedAt && (
                              <span>
                                Synced {formatDistanceToNow(new Date(tracker.lastSyncedAt))} ago
                              </span>
                            )}
                          </div>
                          {tracker.errorMessage && (
                            <p className="text-xs text-red-600 mt-1">{tracker.errorMessage}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSyncTracker(tracker.id)}
                            title="Sync tracker"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTracker(tracker.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Remove tracker"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <Tabs defaultValue="intelligence" className="w-full">
              <TabsList className="bg-white border border-stone-200 p-1 rounded-lg">
                <TabsTrigger value="intelligence">
                  <Lightbulb className="h-4 w-4 mr-2" />
                  Knowledge
                </TabsTrigger>
                <TabsTrigger value="slack">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Slack ({brand.slackMessages.length})
                </TabsTrigger>
              </TabsList>

              {/* Brand Knowledge Tab */}
              <TabsContent value="intelligence" className="mt-6">
                {/* PDF Upload Section */}
                <div className="bg-white border border-stone-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Upload className="h-5 w-5 text-stone-400" />
                      <div>
                        <h3 className="text-sm font-medium text-stone-700">Import Brand Brief</h3>
                        <p className="text-xs text-stone-500">Upload PDF presentations to enhance brand context (max 32MB)</p>
                      </div>
                    </div>
                    <div>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={handlePdfUpload}
                        className="hidden"
                        id="pdf-upload"
                        disabled={uploadingPdf}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('pdf-upload')?.click()}
                        disabled={uploadingPdf}
                      >
                        {uploadingPdf ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload PDF
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <KnowledgeBase brandId={brand.id} />
              </TabsContent>

              {/* Slack Tab */}
              <TabsContent value="slack" className="mt-6">
                <div className="space-y-4">
                  {/* Slack Channel Connection Status */}
                  <div className="bg-white border border-stone-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="h-5 w-5 text-stone-400" />
                        <div>
                          <h3 className="text-sm font-medium text-stone-700">Slack Channel</h3>
                          <p className="text-sm text-stone-600">
                            {brand.slackChannelName ? (
                              <span className="font-mono text-blue-600">#{brand.slackChannelName}</span>
                            ) : (
                              <span className="text-stone-400 italic">Not connected</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingSlack(true)}
                      >
                        {brand.slackChannelName ? 'Change' : 'Connect'}
                      </Button>
                    </div>
                  </div>

                  {/* Slack Messages */}
                  {brand.slackMessages.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-lg p-12 text-center">
                      <MessageSquare className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                      <p className="text-stone-600">
                        {brand.slackChannelId
                          ? 'No messages synced yet. Click Sync to fetch channel history.'
                          : 'No Slack channel connected.'}
                      </p>
                    </div>
                  ) : (
                  <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-100">
                    {brand.slackMessages.map((msg) => (
                      <div key={msg.id} className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-stone-900">
                            {msg.userName || 'Unknown'}
                          </span>
                          <span className="text-xs text-stone-400">
                            {formatDistanceToNow(new Date(msg.createdAt))} ago
                          </span>
                        </div>
                        <p className="text-stone-700 whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Slack Channel Modal */}
      {editingSlack && brand && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-stone-900">Select Slack Channel</h2>
              <button onClick={() => setEditingSlack(false)} className="text-stone-400 hover:text-stone-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SlackChannelSelector
              currentChannelId={brand.slackChannelId}
              onSave={async (channelId, channelName) => {
                try {
                  const res = await fetch(`/api/brands/${brandId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      slackChannelId: channelId,
                      slackChannelName: channelName,
                    }),
                  })
                  if (res.ok) {
                    window.location.reload()
                  }
                } catch (error) {
                  console.error('Failed to update Slack channel:', error)
                }
                setEditingSlack(false)
              }}
              onCancel={() => setEditingSlack(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Slack Channel Selector Component
function SlackChannelSelector({
  currentChannelId,
  onSave,
  onCancel,
}: {
  currentChannelId?: string | null
  onSave: (channelId: string | null, channelName: string | null) => void
  onCancel: () => void
}) {
  const [channels, setChannels] = useState<Array<{id: string, name: string}>>([])
  const [selectedChannel, setSelectedChannel] = useState(currentChannelId || '')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadChannels() {
      setLoading(true)
      try {
        const res = await fetch('/api/slack/channels')
        if (res.ok) {
          const data = await res.json()
          setChannels(data.channels || [])
        }
      } catch (error) {
        console.error('Failed to load channels:', error)
      } finally {
        setLoading(false)
      }
    }
    loadChannels()
  }, [])

  const handleSave = () => {
    const channel = channels.find(ch => ch.id === selectedChannel)
    onSave(selectedChannel || null, channel?.name || null)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">
          Channel
        </label>
        <select
          value={selectedChannel}
          onChange={(e) => setSelectedChannel(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-2 focus:ring-stone-400"
        >
          <option value="">No channel</option>
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              #{ch.name}
            </option>
          ))}
        </select>
        {loading && (
          <p className="text-xs text-stone-400 mt-2">Loading channels...</p>
        )}
      </div>

      <div className="flex gap-3 justify-end pt-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={loading}>
          Save
        </Button>
      </div>
    </div>
  )
}
