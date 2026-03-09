'use client'

import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react'

interface TrendCardProps {
  trend: {
    id: string
    trendType: string
    metric: string
    direction: string
    title: string
    description: string
    magnitude?: number | null
    timeframe: string
    confidence: string
    platforms?: string | null
  }
}

const directionConfig: Record<string, { icon: any; color: string; bg: string }> = {
  increasing: { icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
  decreasing: { icon: TrendingDown, color: 'text-red-600', bg: 'bg-red-50' },
  stable: { icon: Minus, color: 'text-stone-600', bg: 'bg-stone-50' },
  volatile: { icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
}

const trendTypeLabels: Record<string, string> = {
  growth: '📈 Growth',
  decline: '📉 Decline',
  seasonal: '🌀 Seasonal',
  platform_shift: '🔄 Platform Shift',
  budget_change: '💰 Budget Change',
}

export default function TrendCard({ trend }: TrendCardProps) {
  const direction = directionConfig[trend.direction] || directionConfig.stable
  const DirectionIcon = direction.icon
  const trendLabel = trendTypeLabels[trend.trendType] || trend.trendType

  let platforms: string[] = []
  try {
    platforms = trend.platforms ? JSON.parse(trend.platforms) : []
  } catch {
    platforms = []
  }

  return (
    <div className={cn('border border-stone-200 rounded-lg p-4', direction.bg)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <DirectionIcon className={cn('h-5 w-5', direction.color)} />
          <h3 className={cn('font-medium', direction.color)}>{trend.title}</h3>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-stone-200 text-stone-600">
          {trendLabel}
        </span>
      </div>

      {/* Magnitude */}
      {trend.magnitude !== null && trend.magnitude !== undefined && (
        <div className={cn('mt-2 text-2xl font-bold', direction.color)}>
          {trend.direction === 'increasing' && '+'}
          {trend.magnitude.toFixed(1)}%
        </div>
      )}

      {/* Description */}
      <p className="mt-2 text-sm text-stone-600">{trend.description}</p>

      {/* Metadata */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
        <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
          {trend.metric}
        </span>
        <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
          {trend.timeframe}
        </span>
        {platforms.length > 0 && (
          <span className="bg-white px-2 py-0.5 rounded border border-stone-200">
            {platforms.join(', ')}
          </span>
        )}
        <span className="ml-auto opacity-60">
          {trend.confidence} confidence
        </span>
      </div>
    </div>
  )
}
