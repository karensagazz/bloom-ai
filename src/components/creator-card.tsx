import { formatNumber } from '@/lib/utils'
import { TrendingUp } from 'lucide-react'

interface CreatorCardProps {
  creator: {
    id: string
    name: string
    platform: string
    handle: string
    followers: number
    archetype: string
    vertical: string
    engagement?: number | null
  }
}

export function CreatorCard({ creator }: CreatorCardProps) {
  const platformColors = {
    Instagram: 'bg-pink-50 text-pink-700',
    TikTok: 'bg-slate-50 text-slate-700',
    YouTube: 'bg-red-50 text-red-700',
    Twitter: 'bg-blue-50 text-blue-700',
  }

  return (
    <div className="bg-white border border-stone-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-medium text-stone-900">{creator.name}</h3>
          <p className="text-sm text-stone-500">@{creator.handle}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${platformColors[creator.platform as keyof typeof platformColors] || 'bg-stone-50 text-stone-700'}`}>
          {creator.platform}
        </span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-stone-600">Followers</span>
          <span className="font-medium text-stone-900">{formatNumber(creator.followers)}</span>
        </div>

        {creator.engagement && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-stone-600">Engagement</span>
            <span className="font-medium text-stone-900 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {creator.engagement}%
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-stone-100 space-y-1">
          <div className="text-xs text-stone-500">
            <span className="font-medium">Archetype:</span> {creator.archetype}
          </div>
          <div className="text-xs text-stone-500">
            <span className="font-medium">Vertical:</span> {creator.vertical}
          </div>
        </div>
      </div>
    </div>
  )
}
