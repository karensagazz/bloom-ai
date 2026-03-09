'use client'

import { cn } from '@/lib/utils'
import { Lightbulb, Clock, Zap, CheckCircle } from 'lucide-react'

interface RecommendationCardProps {
  recommendation: {
    id: string
    category: string
    priority: string
    title: string
    recommendation: string
    rationale: string
    expectedImpact?: string | null
    effort?: string | null
    timeframe?: string | null
    status: string
    confidence: string
  }
}

const priorityConfig: Record<string, { color: string; bg: string; border: string }> = {
  urgent: { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' },
  high: { color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' },
  medium: { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  low: { color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
}

const effortLabels: Record<string, { icon: any; label: string }> = {
  low: { icon: Zap, label: 'Quick win' },
  medium: { icon: Clock, label: 'Moderate effort' },
  high: { icon: Clock, label: 'Significant effort' },
}

const categoryIcons: Record<string, string> = {
  budget: '💰',
  influencer_selection: '👤',
  platform: '📱',
  content_type: '🎨',
  timing: '⏰',
}

export default function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const priority = priorityConfig[recommendation.priority] || priorityConfig.medium
  const effort = effortLabels[recommendation.effort || 'medium']
  const EffortIcon = effort?.icon || Clock
  const categoryIcon = categoryIcons[recommendation.category] || '💡'
  const isImplemented = recommendation.status === 'implemented'

  return (
    <div className={cn(
      'border rounded-lg p-4 transition-all',
      isImplemented
        ? 'bg-stone-50 border-stone-200 opacity-75'
        : cn(priority.bg, priority.border)
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {isImplemented ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <Lightbulb className={cn('h-5 w-5', priority.color)} />
          )}
          <h3 className={cn(
            'font-medium',
            isImplemented ? 'text-stone-600 line-through' : priority.color
          )}>
            {recommendation.title}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {isImplemented && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
              ✓ Implemented
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-stone-200">
            {categoryIcon} {recommendation.category.replace('_', ' ')}
          </span>
        </div>
      </div>

      {/* Recommendation */}
      <div className="mt-3 p-3 bg-white rounded-md border border-stone-100">
        <p className="text-sm text-stone-800">{recommendation.recommendation}</p>
      </div>

      {/* Rationale */}
      <div className="mt-2">
        <p className="text-xs text-stone-500 font-medium">Why?</p>
        <p className="text-sm text-stone-600">{recommendation.rationale}</p>
      </div>

      {/* Metadata Row */}
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {recommendation.expectedImpact && (
          <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded">
            📈 {recommendation.expectedImpact}
          </span>
        )}
        {effort && (
          <span className="flex items-center gap-1 text-stone-600 bg-stone-100 px-2 py-1 rounded">
            <EffortIcon className="h-3 w-3" />
            {effort.label}
          </span>
        )}
        {recommendation.timeframe && (
          <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-1 rounded">
            🗓️ {recommendation.timeframe}
          </span>
        )}
        <span className="ml-auto text-stone-400">
          {recommendation.confidence} confidence
        </span>
      </div>
    </div>
  )
}
