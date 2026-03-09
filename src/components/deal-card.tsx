import { formatCurrency, formatDate } from '@/lib/utils'
import { Clock, DollarSign, User } from 'lucide-react'

interface DealCardProps {
  deal: {
    id: string
    title: string
    status: string
    dealValue?: number | null
    priority: string
    createdAt: Date | string
    brand: {
      name: string
    }
    creator?: {
      name: string
    } | null
  }
}

export function DealCard({ deal }: DealCardProps) {
  const statusColors = {
    open: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    closed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
  }

  const priorityColors = {
    low: 'border-stone-200',
    medium: 'border-yellow-300',
    high: 'border-red-300',
  }

  return (
    <div className={`border-l-4 ${priorityColors[deal.priority as keyof typeof priorityColors]} bg-white p-4 hover:shadow-sm transition-shadow`}>
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-stone-900">{deal.title}</h3>
        <span className={`text-xs px-2 py-1 rounded-full ${statusColors[deal.status as keyof typeof statusColors]}`}>
          {deal.status.replace('_', ' ')}
        </span>
      </div>

      <div className="space-y-1 text-sm text-stone-600">
        <div className="flex items-center gap-2">
          <User className="h-3 w-3" />
          <span>{deal.brand.name}</span>
        </div>

        {deal.creator && (
          <div className="flex items-center gap-2">
            <User className="h-3 w-3" />
            <span>→ {deal.creator.name}</span>
          </div>
        )}

        {deal.dealValue && (
          <div className="flex items-center gap-2">
            <DollarSign className="h-3 w-3" />
            <span>{formatCurrency(deal.dealValue)}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Clock className="h-3 w-3" />
          <span>{formatDate(deal.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}
