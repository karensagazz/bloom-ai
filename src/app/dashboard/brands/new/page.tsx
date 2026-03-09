'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function NewBrandPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [slackChannels, setSlackChannels] = useState<Array<{id: string, name: string}>>([])
  const [selectedChannel, setSelectedChannel] = useState('')
  const [loadingChannels, setLoadingChannels] = useState(false)

  // Fetch Slack channels on mount
  useEffect(() => {
    async function loadChannels() {
      setLoadingChannels(true)
      try {
        const res = await fetch('/api/slack/channels')
        if (res.ok) {
          const data = await res.json()
          setSlackChannels(data.channels || [])
        }
      } catch (error) {
        console.error('Failed to load Slack channels:', error)
      } finally {
        setLoadingChannels(false)
      }
    }
    loadChannels()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/brands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          website: website || undefined,
          slackChannelId: selectedChannel || undefined,
          slackChannelName: selectedChannel
            ? slackChannels.find(ch => ch.id === selectedChannel)?.name
            : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to create brand')
        return
      }

      // Redirect to brand detail page
      router.push(`/dashboard/brands/${data.id}`)
    } catch (e) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/dashboard/brands"
          className="inline-flex items-center gap-2 text-sm text-stone-600 hover:text-stone-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Brands
        </Link>

        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Plus className="h-6 w-6 text-stone-700" />
            <h1 className="text-xl font-semibold text-stone-900">Create Brand</h1>
          </div>

          <p className="text-sm text-stone-600 mb-6">
            Create a new brand to track campaigns, influencers, and insights.
            You can connect campaign trackers after creating the brand.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Brand Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="e.g. Nike, Coca-Cola"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="website">Brand Website (optional)</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://brand.com"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-stone-500 mt-1">
                AI will generate a summary from the website
              </p>
            </div>

            <div>
              <Label htmlFor="slack-channel">Slack Channel (optional)</Label>
              <select
                id="slack-channel"
                value={selectedChannel}
                onChange={(e) => setSelectedChannel(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-md mt-1 focus:ring-2 focus:ring-stone-400"
                disabled={loadingChannels}
              >
                <option value="">No Slack channel</option>
                {slackChannels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name}
                  </option>
                ))}
              </select>
              {loadingChannels && (
                <p className="text-xs text-stone-400 mt-1">Loading channels...</p>
              )}
              {!loadingChannels && slackChannels.length === 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  No channels found. Configure Slack bot token in Settings.
                </p>
              )}
              <p className="text-xs text-stone-500 mt-1">
                Link this brand to a Slack channel for automated context tracking
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Link href="/dashboard/brands">
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </Link>
              <Button type="submit" disabled={loading || !name.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Brand'
                )}
              </Button>
            </div>
          </form>
        </div>

        <div className="mt-6 p-4 bg-stone-100 border border-stone-200 rounded-lg">
          <h3 className="text-sm font-medium text-stone-700 mb-2">
            💡 Next steps after creating:
          </h3>
          <ul className="text-sm text-stone-600 space-y-1">
            <li>• Connect campaign trackers (Google Sheets) to import data</li>
            <li>• Link a Slack channel for team context</li>
            <li>• The Knowledge Base will auto-generate insights from your data</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
