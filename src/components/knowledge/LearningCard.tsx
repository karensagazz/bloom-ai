'use client'

import { cn } from '@/lib/utils'

interface LearningCardProps {
  learning: {
    id: string
    category: string
    priority: string
    title: string
    description: string
    recommendation?: string | null
    confidence: string
    platforms?: string | null
    timeframe?: string | null
    sampleSize?: number | null
  }
}

const priorityConfig: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-red-700', bg: 'bg-red-100', label: '🔴 Critical' },
  high: { color: 'text-orange-700', bg: 'bg-orange-100', label: '🟠 High' },
  medium: { color: 'text-amber-700', bg: 'bg-amber-100', label: '🟡 Medium' },
  low: { color: 'text-green-700', bg: 'bg-green-100', label: '🟢 Low' },
}

const categoryIcons: Record<string, string> = {
  platform_strategy: '📱',
  budget_optimization: '💰',
  content_type: '🎨',
  timing: '⏰',
  audience: '👥',
}

export default function LearningCard({ learning }: LearningCardProps) {
  const priority = priorityConfig[learning.priority] || priorityConfig.medium
  const categoryIcon = categoryIcons[learning.category] || '📚'

  let platforms: string[] = []
  try {
    platforms = learning.platforms ? JSON.parse(learning.platforms) : []
  } catch {
    platforms = []
  }

  return (
    <div className="border border-stone-200 rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{categoryIcon}</span>
          <h3 className="font-medium text-stone-900">{learning.title}</h3>
        </div>
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', priority.bg, priority.color)}>
          {priority.label}
        </span>
      </div>

      {/* Description */}
      <p className="mt-2 text-sm text-stone-600">{learning.description}</p>

      {/* Recommendation */}
      {learning.recommendation && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>Recommendation:</strong> {learning.recommendation}
          </p>
        </div>
      )}

      {/* Metadata */}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
        {platforms.length > 0 && (
          <span className="bg-stone-100 px-2 py-0.5 rounded">
            {platforms.join(', ')}
          </span>
        )}
        {learning.timeframe && (
          <span className="bg-stone-100 px-2 py-0.5 rounded">
            {learning.timeframe}
          </span>
        )}
        {learning.sampleSize && (
          <span className="bg-stone-100 px-2 py-0.5 rounded">
            Based on {learning.sampleSize} data points
          </span>
        )}
        <span className="ml-auto opacity-60">
          {learning.confidence} confidence
        </span>
      </div>
    </div>
  )
}
