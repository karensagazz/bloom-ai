'use client'

import { cn } from '@/lib/utils'
import { User, AtSign, Mail, Briefcase } from 'lucide-react'

interface InfluencerCardProps {
  influencer: {
    id: string
    name: string
    handle?: string | null
    platform?: string | null
    email?: string | null
    estimatedRate?: string | null
    totalCampaigns: number
    notes?: string | null
  }
}

const platformColors: Record<string, string> = {
  Instagram: 'bg-pink-100 text-pink-700 border-pink-200',
  TikTok: 'bg-slate-900 text-white border-slate-700',
  YouTube: 'bg-red-100 text-red-700 border-red-200',
  Twitter: 'bg-blue-100 text-blue-700 border-blue-200',
  Facebook: 'bg-indigo-100 text-indigo-700 border-indigo-200',
}

export default function InfluencerCard({ influencer }: InfluencerCardProps) {
  const platformStyle = platformColors[influencer.platform || ''] || 'bg-stone-100 text-stone-700 border-stone-200'

  return (
    <div className="border border-stone-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
            <User className="h-5 w-5 text-stone-500" />
          </div>
          <div>
            <h3 className="font-medium text-stone-900">{influencer.name}</h3>
            {influencer.handle && (
              <p className="text-sm text-stone-500 flex items-center gap-1">
                <AtSign className="h-3 w-3" />
                {influencer.handle}
              </p>
            )}
          </div>
        </div>
        {influencer.platform && (
          <span className={cn('text-xs px-2 py-1 rounded border', platformStyle)}>
            {influencer.platform}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="mt-3 flex gap-4 text-sm">
        <div className="flex items-center gap-1.5 text-stone-600">
          <Briefcase className="h-4 w-4 text-stone-400" />
          <span>{influencer.totalCampaigns} campaigns</span>
        </div>
        {influencer.estimatedRate && (
          <div className="text-green-700 font-medium">
            {influencer.estimatedRate}
          </div>
        )}
      </div>

      {/* Email */}
      {influencer.email && (
        <div className="mt-2 flex items-center gap-1.5 text-sm text-stone-500">
          <Mail className="h-4 w-4" />
          {influencer.email}
        </div>
      )}

      {/* Notes */}
      {influencer.notes && (
        <div className="mt-3 p-2 bg-stone-50 rounded text-sm text-stone-600 italic">
          "{influencer.notes}"
        </div>
      )}
    </div>
  )
}
