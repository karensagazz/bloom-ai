import Link from 'next/link'
import { Plus, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DealCard } from '@/components/deal-card'
import { prisma } from '@/lib/db'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

async function getDeals() {
  return await prisma.deal.findMany({
    include: {
      client: true,
      creator: true,
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

export default async function DealsPage() {
  const deals = await getDeals()

  const openDeals = deals.filter(d => d.status === 'open')
  const inProgressDeals = deals.filter(d => d.status === 'in_progress')
  const closedDeals = deals.filter(d => d.status === 'closed')

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="text-xl font-semibold text-stone-900">Bloom</span>
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link href="/dashboard" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Dashboard
              </Link>
              <Link href="/dashboard/deals" className="text-sm font-medium text-stone-900">
                Deals
              </Link>
              <Link href="/dashboard/clients" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Clients
              </Link>
              <Link href="/dashboard/creators" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Creators
              </Link>
            </nav>
          </div>
          <Link href="/dashboard/deals/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Deal
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">Deals</h1>
            <p className="text-stone-600 mt-1">Manage your influencer marketing deals</p>
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All ({deals.length})</TabsTrigger>
            <TabsTrigger value="open">Open ({openDeals.length})</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress ({inProgressDeals.length})</TabsTrigger>
            <TabsTrigger value="closed">Closed ({closedDeals.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-6">
            {deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </TabsContent>

          <TabsContent value="open" className="space-y-4 mt-6">
            {openDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </TabsContent>

          <TabsContent value="in_progress" className="space-y-4 mt-6">
            {inProgressDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </TabsContent>

          <TabsContent value="closed" className="space-y-4 mt-6">
            {closedDeals.map((deal) => (
              <DealCard key={deal.id} deal={deal} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
