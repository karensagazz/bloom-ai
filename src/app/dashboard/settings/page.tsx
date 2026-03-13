'use client'

import Link from 'next/link'
import { Settings, Slack, Key, Save, ExternalLink, CheckCircle, FileSpreadsheet, Upload, X, BookOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect, useRef } from 'react'

export default function SettingsPage() {
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackSigningSecret, setSlackSigningSecret] = useState('')
  const [googleServiceEmail, setGoogleServiceEmail] = useState('')
  const [googlePrivateKey, setGooglePrivateKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)
  const [skillCardStatus, setSkillCardStatus] = useState<any>(null)

  // Load existing settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          if (data.slackBotToken) setSlackBotToken(data.slackBotToken)
          if (data.slackSigningSecret) setSlackSigningSecret(data.slackSigningSecret)
          if (data.googleServiceEmail) setGoogleServiceEmail(data.googleServiceEmail)
          if (data.googlePrivateKey) setGooglePrivateKey(data.googlePrivateKey)
          if (data.openaiApiKey) setOpenaiKey(data.openaiApiKey)
        }
      } catch (e) {
        console.error('Failed to load settings', e)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slackBotToken,
          slackSigningSecret,
          googleServiceEmail,
          googlePrivateKey,
          openaiApiKey: openaiKey,
        }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch (e) {
      console.error('Failed to save settings', e)
    } finally {
      setSaving(false)
    }
  }

  // Upload industry knowledge file (assumes first brand exists - global knowledge)
  const handleFileUpload = async (file: File) => {
    const validTypes = ['application/pdf', 'text/plain', 'text/markdown', 'text/csv']
    if (!validTypes.includes(file.type) && !file.name.endsWith('.md')) {
      alert('Please upload a PDF, TXT, MD, or CSV file')
      return
    }

    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > 32) {
      alert(`File too large (${sizeMB.toFixed(1)}MB). Maximum size is 32MB.`)
      return
    }

    try {
      setUploading(true)
      setUploadStatus(`Uploading ${file.name}...`)

      // Get first brand ID (or create a global knowledge store)
      const brandsRes = await fetch('/api/brands')
      if (!brandsRes.ok) throw new Error('Failed to fetch brands')
      const brands = await brandsRes.json()

      if (!brands || brands.length === 0) {
        throw new Error('No brands found. Please create a brand first.')
      }

      const brandId = brands[0].id

      const formData = new FormData()
      formData.append('file', file)

      setUploadStatus(`Extracting knowledge from ${file.name}...`)

      const res = await fetch(`/api/brands/${brandId}/knowledge/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Upload failed')
      }

      const data = await res.json()
      setUploadStatus(`✓ Successfully uploaded! ${data.summary || ''}`)

      setTimeout(() => setUploadStatus(null), 5000)
    } catch (err: any) {
      console.error('Upload failed:', err)
      alert(`Upload failed: ${err.message}`)
      setUploadStatus(null)
    } finally {
      setUploading(false)
    }
  }

  // Handle drag and drop
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0])
    }
  }

  // Load skill card status
  const loadSkillCardStatus = async () => {
    try {
      const res = await fetch('/api/skills/sync')
      if (res.ok) {
        const data = await res.json()
        setSkillCardStatus(data)
      }
    } catch (e) {
      console.error('Failed to load skill card status', e)
    }
  }

  // Load skill card status on mount
  useEffect(() => {
    loadSkillCardStatus()
  }, [])

  // Sync skill cards
  const handleSyncSkillCards = async () => {
    setSyncing(true)
    setSyncStatus('Syncing skill cards from filesystem...')
    try {
      const res = await fetch('/api/skills/sync', {
        method: 'POST',
      })
      if (res.ok) {
        const data = await res.json()
        setSyncStatus('✓ Skill cards synced successfully!')
        await loadSkillCardStatus()
        setTimeout(() => setSyncStatus(null), 5000)
      } else {
        const data = await res.json()
        throw new Error(data.error || 'Sync failed')
      }
    } catch (err: any) {
      console.error('Skill card sync failed:', err)
      setSyncStatus(`✗ Sync failed: ${err.message}`)
      setTimeout(() => setSyncStatus(null), 5000)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
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
              <Link href="/dashboard/brands" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Brands
              </Link>
              {/* HIDDEN: Creators navigation
              <Link href="/dashboard/creators" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Creators
              </Link>
              */}
              <Link href="/dashboard/settings" className="text-sm font-medium text-stone-900">
                Settings
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-3 mb-8">
          <Settings className="h-6 w-6 text-stone-700" />
          <h1 className="text-2xl font-semibold text-stone-900">Settings</h1>
        </div>

        {loading ? (
          <div className="text-center py-12 text-stone-500">Loading settings...</div>
        ) : (
          <div className="space-y-6">
            {/* Slack Integration */}
            <div className="bg-white border border-stone-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Slack className="h-5 w-5 text-stone-700" />
                <h2 className="text-lg font-medium text-stone-900">Slack Integration</h2>
              </div>
              <p className="text-sm text-stone-600 mb-6">
                Connect your Slack workspace to use the Bloom assistant and sync brand channel context.
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="slack-bot-token">Bot User OAuth Token</Label>
                  <Input
                    id="slack-bot-token"
                    type="password"
                    placeholder="xoxb-..."
                    value={slackBotToken}
                    onChange={(e) => setSlackBotToken(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    Found in OAuth & Permissions after installing your Slack app
                  </p>
                </div>

                <div>
                  <Label htmlFor="slack-signing-secret">Signing Secret</Label>
                  <Input
                    id="slack-signing-secret"
                    type="password"
                    placeholder="..."
                    value={slackSigningSecret}
                    onChange={(e) => setSlackSigningSecret(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    Found in Basic Information → App Credentials
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-stone-100 space-y-2">
                <p className="text-sm text-stone-700 font-medium">Required Bot Scopes:</p>
                <div className="flex flex-wrap gap-2">
                  {['channels:history', 'channels:read', 'chat:write', 'users:read'].map((scope) => (
                    <span key={scope} className="text-xs px-2 py-1 bg-stone-100 rounded font-mono">
                      {scope}
                    </span>
                  ))}
                </div>
                <a
                  href="https://api.slack.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 mt-2"
                >
                  Create/manage Slack apps
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* Google Sheets Integration */}
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-6 opacity-60">
              <div className="flex items-center gap-3 mb-4">
                <FileSpreadsheet className="h-5 w-5 text-stone-700" />
                <h2 className="text-lg font-medium text-stone-900">Google Sheets API</h2>
                <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded font-medium">
                  Not Required
                </span>
              </div>
              <p className="text-sm text-stone-600 mb-4">
                <strong>Good news!</strong> You can use published Google Sheets without any API setup.
              </p>
              <p className="text-xs text-stone-500 mb-6">
                (This section is only needed if you want to access private sheets via API)
              </p>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="google-email">Service Account Email</Label>
                  <Input
                    id="google-email"
                    type="email"
                    placeholder="bloom@project-id.iam.gserviceaccount.com"
                    value={googleServiceEmail}
                    onChange={(e) => setGoogleServiceEmail(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                </div>

                <div>
                  <Label htmlFor="google-key">Private Key</Label>
                  <textarea
                    id="google-key"
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                    value={googlePrivateKey}
                    onChange={(e) => setGooglePrivateKey(e.target.value)}
                    className="mt-1 w-full h-24 px-3 py-2 text-sm font-mono border border-stone-200 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-stone-900"
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    From your service account JSON key file
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-stone-100">
                <p className="text-sm text-stone-600">
                  <strong>Setup:</strong> Create a service account in Google Cloud Console,
                  enable the Google Sheets API, and share your spreadsheets with the service account email.
                </p>
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 mt-2"
                >
                  Google Cloud Console
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>

            {/* API Keys */}
            <div className="bg-white border border-stone-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <Key className="h-5 w-5 text-stone-700" />
                <h2 className="text-lg font-medium text-stone-900">API Keys</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="openai-key">OpenAI API Key</Label>
                  <Input
                    id="openai-key"
                    type="password"
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    className="mt-1 font-mono text-sm"
                  />
                  <p className="text-xs text-stone-500 mt-1">
                    Used for AI-powered brand summaries and Slack assistant
                  </p>
                </div>
              </div>
            </div>

            {/* Industry Knowledge Upload */}
            <div className="bg-white border border-stone-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="h-5 w-5 text-stone-700" />
                <h2 className="text-lg font-medium text-stone-900">Industry Knowledge</h2>
              </div>
              <p className="text-sm text-stone-600 mb-6">
                Upload industry reports, best practices, and reference materials that Bloom can reference when answering questions.
              </p>

              {uploadStatus && (
                <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-blue-700">
                    {uploading && <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />}
                    {uploadStatus}
                  </div>
                  {!uploading && (
                    <button onClick={() => setUploadStatus(null)} className="text-blue-500 hover:text-blue-700">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive ? 'border-orange-500 bg-orange-50' : 'border-stone-300 bg-stone-50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 mx-auto text-stone-400 mb-3" />
                <p className="text-sm text-stone-600 mb-2">
                  Drag and drop your file here, or
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-md text-sm font-medium"
                >
                  Browse Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.md,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <p className="text-xs text-stone-500 mt-4">
                  Supported: PDF, TXT, Markdown (.md), CSV (max 32MB)
                </p>
              </div>

              <div className="mt-4 p-3 bg-stone-50 rounded-md">
                <p className="text-xs text-stone-600">
                  💡 <strong>Tip:</strong> Upload skills documentation, influencer marketing guides,
                  industry benchmarks, or any reference materials you want Bloom to learn from.
                </p>
              </div>
            </div>

            {/* Sync Skill Cards */}
            <div className="bg-white border border-stone-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <RefreshCw className="h-5 w-5 text-stone-700" />
                <h2 className="text-lg font-medium text-stone-900">Sync Skill Cards</h2>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium">
                  System Settings
                </span>
              </div>
              <p className="text-sm text-stone-600 mb-6">
                Skill cards are specialized knowledge files that teach Bloom how to read trackers,
                evaluate performance, plan campaigns, and handle contracts. These files live in
                <code className="px-1 py-0.5 bg-stone-100 rounded text-xs font-mono mx-1">/src/lib/skills/</code>
                and are version-controlled.
              </p>

              {syncStatus && (
                <div className={`mb-4 px-4 py-3 rounded-lg flex items-center justify-between ${
                  syncStatus.startsWith('✓')
                    ? 'bg-green-50 border border-green-200'
                    : syncStatus.startsWith('✗')
                    ? 'bg-red-50 border border-red-200'
                    : 'bg-blue-50 border border-blue-200'
                }`}>
                  <div className={`flex items-center gap-2 text-sm ${
                    syncStatus.startsWith('✓')
                      ? 'text-green-700'
                      : syncStatus.startsWith('✗')
                      ? 'text-red-700'
                      : 'text-blue-700'
                  }`}>
                    {syncing && <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full" />}
                    {syncStatus}
                  </div>
                  {!syncing && (
                    <button onClick={() => setSyncStatus(null)} className={
                      syncStatus.startsWith('✓')
                        ? 'text-green-500 hover:text-green-700'
                        : syncStatus.startsWith('✗')
                        ? 'text-red-500 hover:text-red-700'
                        : 'text-blue-500 hover:text-blue-700'
                    }>
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}

              {skillCardStatus && (
                <div className="mb-4 p-4 bg-stone-50 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-stone-900">Current Status</h3>
                    <span className="text-xs text-stone-500">Expected: 4 cards per brand</span>
                  </div>
                  <div className="space-y-2">
                    {skillCardStatus.brands && skillCardStatus.brands.map((brand: any) => (
                      <div key={brand.brandId} className="flex items-center justify-between text-sm">
                        <span className="text-stone-700">{brand.brandName}</span>
                        <span className={`font-mono ${
                          brand.skillCardsCount === skillCardStatus.expectedPerBrand
                            ? 'text-green-600'
                            : 'text-orange-600'
                        }`}>
                          {brand.skillCardsCount} / {skillCardStatus.expectedPerBrand}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-stone-900">Available Skill Cards:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { name: 'Tracker Reading', file: 'skill_tracker_reading.md', desc: 'Column mappings, tab patterns' },
                    { name: 'Performance Benchmarks', file: 'skill_performance_benchmarks.md', desc: 'Engagement rates, CPM/CPE' },
                    { name: 'Campaign Strategy', file: 'skill_campaign_strategy.md', desc: 'Planning, creator selection' },
                    { name: 'Legal Compliance', file: 'skill_legal_compliance.md', desc: 'FTC, contracts, usage rights' },
                  ].map((skill) => (
                    <div key={skill.file} className="p-3 bg-stone-50 rounded-md border border-stone-200">
                      <div className="text-sm font-medium text-stone-900">{skill.name}</div>
                      <div className="text-xs text-stone-500 mt-1 font-mono">{skill.file}</div>
                      <div className="text-xs text-stone-600 mt-1">{skill.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <Button
                  onClick={handleSyncSkillCards}
                  disabled={syncing}
                  variant="outline"
                  className="w-full"
                >
                  {syncing ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Sync Skill Cards from Filesystem
                    </>
                  )}
                </Button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <p className="text-xs text-blue-900">
                  <strong>💡 When to sync:</strong> After updating any <code className="px-1 py-0.5 bg-blue-100 rounded">.md</code> files
                  in <code className="px-1 py-0.5 bg-blue-100 rounded">/src/lib/skills/</code>, click the sync button to update the database.
                  This ensures Bloom uses the latest skill card content.
                </p>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="min-w-[140px]">
                {saved ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Saved!
                  </>
                ) : saving ? (
                  'Saving...'
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
