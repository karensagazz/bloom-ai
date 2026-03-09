'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { Plus, RefreshCw, FileSpreadsheet, MessageSquare, ExternalLink, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow } from 'date-fns'

interface Brand {
  id: string
  name: string
  spreadsheetUrl: string | null
  slackChannelName: string | null
  website: string | null
  syncStatus: string
  lastSyncedAt: string | null
  _count: {
    campaignTrackers: number
    brandInfluencers: number
    campaignRecords: number
    sheetRows: number
    slackMessages: number
  }
}

export default function BrandsPage() {
  const [brands, setBrands] = useState<Brand[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)

  async function loadBrands() {
    try {
      const res = await fetch('/api/brands')
      if (res.ok) {
        const data = await res.json()
        setBrands(data)
      }
    } catch (e) {
      console.error('Failed to load brands', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBrands()
  }, [])

  async function handleSync(brandId: string) {
    setSyncing(brandId)
    try {
      await fetch(`/api/brands/${brandId}/sync`, { method: 'POST' })
      await loadBrands()
    } catch (e) {
      console.error('Failed to sync', e)
    } finally {
      setSyncing(null)
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
          <div className="flex items-center gap-3">
            <Link href="/dashboard/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/brands/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Brand
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-stone-900">Brands</h1>
          <p className="text-sm text-stone-600">
            {brands.length} brand{brands.length !== 1 ? 's' : ''} connected
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-stone-500">Loading brands...</div>
        ) : brands.length === 0 ? (
          <div className="bg-white border border-stone-200 rounded-lg p-12 text-center">
            <FileSpreadsheet className="h-12 w-12 text-stone-300 mx-auto mb-4" />
            <h2 className="text-lg font-medium text-stone-900 mb-2">No brands connected</h2>
            <p className="text-stone-600 mb-6">
              Connect your first campaign tracker spreadsheet to get started.
            </p>
            <Link href="/dashboard/brands/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Brand
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {brands.map((brand) => (
              <div
                key={brand.id}
                className="bg-white border border-stone-200 rounded-lg p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <Link href={`/dashboard/brands/${brand.id}`}>
                      <h3 className="text-lg font-medium text-stone-900 hover:text-stone-700">
                        {brand.name}
                      </h3>
                    </Link>

                    <div className="flex items-center gap-4 mt-2 text-sm text-stone-600">
                      {brand._count.campaignTrackers > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <FileSpreadsheet className="h-4 w-4" />
                          {brand._count.campaignTrackers} tracker{brand._count.campaignTrackers !== 1 ? 's' : ''}
                        </span>
                      )}

                      {brand._count.campaignRecords > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span>•</span>
                          {brand._count.campaignRecords} campaign{brand._count.campaignRecords !== 1 ? 's' : ''}
                        </span>
                      )}

                      {brand._count.brandInfluencers > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <span>•</span>
                          {brand._count.brandInfluencers} influencer{brand._count.brandInfluencers !== 1 ? 's' : ''}
                        </span>
                      )}

                      {brand.slackChannelName && (
                        <span className="inline-flex items-center gap-1">
                          <span>•</span>
                          <MessageSquare className="h-4 w-4" />
                          #{brand.slackChannelName}
                        </span>
                      )}
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
                      {brand.lastSyncedAt && (
                        <span className="text-xs text-stone-500">
                          Last synced {formatDistanceToNow(new Date(brand.lastSyncedAt))} ago
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(brand.id)}
                      disabled={syncing === brand.id}
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${syncing === brand.id ? 'animate-spin' : ''}`}
                      />
                    </Button>
                    <Link href={`/dashboard/brands/${brand.id}`}>
                      <Button variant="outline" size="sm">
                        View
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
