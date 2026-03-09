'use client'

import Link from 'next/link'
import { Settings, Slack, Key, Save, ExternalLink, CheckCircle, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useState, useEffect } from 'react'

export default function SettingsPage() {
  const [slackBotToken, setSlackBotToken] = useState('')
  const [slackSigningSecret, setSlackSigningSecret] = useState('')
  const [googleServiceEmail, setGoogleServiceEmail] = useState('')
  const [googlePrivateKey, setGooglePrivateKey] = useState('')
  const [openaiKey, setOpenaiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

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
