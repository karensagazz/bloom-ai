import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreatorCard } from '@/components/creator-card'
import { prisma } from '@/lib/db'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export const dynamic = 'force-dynamic'

async function getCreators() {
  return await prisma.creator.findMany({
    orderBy: {
      followers: 'desc',
    },
  })
}

export default async function CreatorsPage() {
  const creators = await getCreators()

  const platforms = ['Instagram', 'TikTok', 'YouTube', 'Twitter']
  const creatorsByPlatform = platforms.reduce((acc, platform) => {
    acc[platform] = creators.filter(c => c.platform === platform)
    return acc
  }, {} as Record<string, typeof creators>)

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
              <Link href="/dashboard/deals" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Deals
              </Link>
              <Link href="/dashboard/clients" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Clients
              </Link>
              <Link href="/dashboard/creators" className="text-sm font-medium text-stone-900">
                Creators
              </Link>
            </nav>
          </div>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Creator
          </Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">Creator Roster</h1>
            <p className="text-stone-600 mt-1">Browse and manage your influencer network</p>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All ({creators.length})</TabsTrigger>
            {platforms.map(platform => (
              <TabsTrigger key={platform} value={platform}>
                {platform} ({creatorsByPlatform[platform].length})
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
            {creators.map((creator) => (
              <CreatorCard key={creator.id} creator={creator} />
            ))}
          </TabsContent>

          {platforms.map(platform => (
            <TabsContent key={platform} value={platform} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
              {creatorsByPlatform[platform].map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </TabsContent>
          ))}
        </Tabs>

        {creators.length === 0 && (
          <div className="bg-white p-12 text-center border border-stone-200">
            <Users className="h-12 w-12 text-stone-400 mx-auto mb-4" />
            <p className="text-stone-600">No creators in your roster yet. Add your first creator to get started!</p>
            <Button className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Add Creator
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
