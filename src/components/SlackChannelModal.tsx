'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface SlackChannelModalProps {
  currentChannelId?: string | null
  onSave: (channelId: string | null, channelName: string | null) => void
  onCancel: () => void
}

export function SlackChannelModal({ currentChannelId, onSave, onCancel }: SlackChannelModalProps) {
  const [channels, setChannels] = useState<Array<{id: string, name: string}>>([])
  const [selectedChannel, setSelectedChannel] = useState(currentChannelId || '')
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

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

  // Filter channels based on search query
  const filteredChannels = channels.filter(ch =>
    ch.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-900">Select Slack Channel</h2>
          <button onClick={onCancel} className="text-stone-400 hover:text-stone-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Search Channels
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type to search channels..."
              disabled={loading}
              className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-2 focus:ring-stone-400 mb-3"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">
              Channel {filteredChannels.length > 0 && `(${filteredChannels.length})`}
            </label>
            <select
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-stone-300 rounded-md focus:ring-2 focus:ring-stone-400"
              size={Math.min(filteredChannels.length + 1, 10)}
            >
              <option value="">No channel</option>
              {filteredChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  #{ch.name}
                </option>
              ))}
            </select>
            {loading && (
              <p className="text-xs text-stone-400 mt-2">Loading channels...</p>
            )}
            {!loading && channels.length === 0 && (
              <p className="text-xs text-amber-600 mt-2">
                No channels found. Make sure the Bloom bot has been added to at least one channel.
              </p>
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
      </div>
    </div>
  )
}
