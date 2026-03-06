import Link from 'next/link'
import { BarChart3, MessageSquare, Users, Briefcase, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChatInterface } from '@/components/chat-interface'
import { DealCard } from '@/components/deal-card'
import { CreatorCard } from '@/components/creator-card'
import { prisma } from '@/lib/db'

async function getDashboardData() {
  const deals = await prisma.deal.findMany({
    include: {
      client: true,
      creator: true,
      user: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 10,
  })

  const clients = await prisma.client.findMany({
    orderBy: {
      createdAt: 'desc',
    },
    take: 6,
  })

  const creators = await prisma.creator.findMany({
    orderBy: {
      followers: 'desc',
    },
    take: 8,
  })

  const stats = {
    openDeals: await prisma.deal.count({ where: { status: 'open' } }),
    totalClients: await prisma.client.count(),
    totalCreators: await prisma.creator.count(),
    activeDeals: await prisma.deal.count({
      where: {
        status: { in: ['open', 'in_progress'] }
      }
    }),
  }

  return { deals, clients, creators, stats }
}

export default async function DashboardPage() {
  const { deals, clients, creators, stats } = await getDashboardData()

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
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
              <Link href="/dashboard" className="text-sm font-medium text-stone-900">
                Dashboard
              </Link>
              <Link href="/dashboard/deals" className="text-sm font-medium text-stone-600 hover:text-stone-900">
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
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-6 border border-stone-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Open Deals</p>
                <p className="text-3xl font-semibold text-stone-900 mt-2">{stats.openDeals}</p>
              </div>
              <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                <Briefcase className="h-6 w-6 text-stone-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 border border-stone-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Active Deals</p>
                <p className="text-3xl font-semibold text-stone-900 mt-2">{stats.activeDeals}</p>
              </div>
              <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-stone-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 border border-stone-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Total Clients</p>
                <p className="text-3xl font-semibold text-stone-900 mt-2">{stats.totalClients}</p>
              </div>
              <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-stone-600" />
              </div>
            </div>
          </div>

          <div className="bg-white p-6 border border-stone-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Creator Roster</p>
                <p className="text-3xl font-semibold text-stone-900 mt-2">{stats.totalCreators}</p>
              </div>
              <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                <Users className="h-6 w-6 text-stone-600" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Tabs defaultValue="deals" className="w-full">
              <TabsList className="w-full justify-start">
                <TabsTrigger value="deals">Recent Deals</TabsTrigger>
                <TabsTrigger value="clients">Clients</TabsTrigger>
                <TabsTrigger value="creators">Creators</TabsTrigger>
              </TabsList>

              <TabsContent value="deals" className="space-y-4 mt-6">
                {deals.length === 0 ? (
                  <div className="bg-white p-12 text-center border border-stone-200">
                    <Briefcase className="h-12 w-12 text-stone-400 mx-auto mb-4" />
                    <p className="text-stone-600">No deals yet. Create your first deal to get started!</p>
                    <Link href="/dashboard/deals/new">
                      <Button className="mt-4">Create Deal</Button>
                    </Link>
                  </div>
                ) : (
                  deals.map((deal) => (
                    <DealCard key={deal.id} deal={deal} />
                  ))
                )}
              </TabsContent>

              <TabsContent value="clients" className="mt-6">
                {clients.length === 0 ? (
                  <div className="bg-white p-12 text-center border border-stone-200">
                    <Users className="h-12 w-12 text-stone-400 mx-auto mb-4" />
                    <p className="text-stone-600">No clients yet.</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {clients.map((client) => (
                      <div key={client.id} className="bg-white p-4 border border-stone-200 hover:shadow-sm transition-shadow">
                        <h3 className="font-medium text-stone-900">{client.name}</h3>
                        <p className="text-sm text-stone-600 mt-1">{client.industry}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-xs px-2 py-1 bg-stone-100 text-stone-700 rounded">
                            {client.vertical}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            client.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-stone-100 text-stone-600'
                          }`}>
                            {client.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="creators" className="mt-6">
                {creators.length === 0 ? (
                  <div className="bg-white p-12 text-center border border-stone-200">
                    <Users className="h-12 w-12 text-stone-400 mx-auto mb-4" />
                    <p className="text-stone-600">No creators in your roster yet.</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 gap-4">
                    {creators.map((creator) => (
                      <CreatorCard key={creator.id} creator={creator} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* AI Assistant Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white border border-stone-200 h-[600px] flex flex-col sticky top-8">
              <div className="border-b border-stone-200 p-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-stone-600" />
                <h2 className="font-semibold text-stone-900">AI Assistant</h2>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatInterface />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
