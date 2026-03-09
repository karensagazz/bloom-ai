'use client'

import { cn } from '@/lib/utils'

interface InsightCardProps {
  insight: {
    id: string
    category: string
    sentiment: string
    title: string
    description: string
    confidence: string
    influencerName?: string | null
    campaignName?: string | null
    platform?: string | null
    year?: number | null
  }
}

const sentimentConfig: Record<string, { emoji: string; bgColor: string; textColor: string }> = {
  positive: { emoji: '✅', bgColor: 'bg-green-50', textColor: 'text-green-700' },
  negative: { emoji: '⚠️', bgColor: 'bg-red-50', textColor: 'text-red-700' },
  neutral: { emoji: 'ℹ️', bgColor: 'bg-stone-50', textColor: 'text-stone-700' },
  mixed: { emoji: '🔀', bgColor: 'bg-amber-50', textColor: 'text-amber-700' },
}

const categoryColors: Record<string, string> = {
  performance: 'bg-blue-100 text-blue-700',
  creative: 'bg-purple-100 text-purple-700',
  audience: 'bg-pink-100 text-pink-700',
  timing: 'bg-orange-100 text-orange-700',
  budget: 'bg-green-100 text-green-700',
}

export default function InsightCard({ insight }: InsightCardProps) {
  const sentiment = sentimentConfig[insight.sentiment] || sentimentConfig.neutral
  const categoryStyle = categoryColors[insight.category] || 'bg-stone-100 text-stone-700'

  return (
    <div className={cn('border border-stone-200 rounded-lg p-4', sentiment.bgColor)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{sentiment.emoji}</span>
          <h3 className={cn('font-medium', sentiment.textColor)}>{insight.title}</h3>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full', categoryStyle)}>
          {insight.category}
        </span>
      </div>

      {/* Description */}
      <p className="mt-2 text-sm text-stone-600">{insight.description}</p>

      {/* Metadata */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
        {insight.influencerName && (
          <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
            @{insight.influencerName}
          </span>
        )}
        {insight.platform && (
          <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
            {insight.platform}
          </span>
        )}
        {insight.year && (
          <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
            {insight.year}
          </span>
        )}
        <span className="ml-auto opacity-60">
          {insight.confidence} confidence
        </span>
      </div>
    </div>
  )
}
