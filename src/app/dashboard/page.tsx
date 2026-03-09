import Link from 'next/link'
import { BarChart3, Users, Briefcase, Plus, Settings, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// HIDDEN: Creators functionality
// import { CreatorCard } from '@/components/creator-card'
import { prisma } from '@/lib/db'

async function getDashboardData() {
  console.log('[Dashboard] Loading data...')
  console.log('[Dashboard] DATABASE_URL configured:', !!process.env.DATABASE_URL)

  try {
    const brands = await prisma.brand.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      take: 10,
    })

    console.log('[Dashboard] Brands found:', brands.length)
    if (brands.length === 0) {
      console.log('[Dashboard] No brands in database - check if DB is seeded')
    }

    const stats = {
      totalBrands: await prisma.brand.count(),
      totalCreators: await prisma.creator.count(),
      syncedBrands: await prisma.brand.count({ where: { syncStatus: 'synced' } }),
      pendingSync: await prisma.brand.count({ where: { syncStatus: 'pending' } }),
    }

    console.log('[Dashboard] Stats:', JSON.stringify(stats))

    return { brands, stats }
  } catch (error) {
    console.error('[Dashboard] Database error:', error)
    // Return empty state so page still renders
    return {
      brands: [],
      stats: { totalBrands: 0, totalCreators: 0, syncedBrands: 0, pendingSync: 0 },
    }
  }
}

export default async function DashboardPage() {
  const { brands, stats } = await getDashboardData()

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="text-xl font-semibold text-stone-900">Bloom</span>
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link href="/dashboard" className="text-sm font-medium text-stone-900">
                Dashboard
              </Link>
              <Link href="/dashboard/brands" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Brands
              </Link>
              {/* HIDDEN: Creators navigation
              <Link href="/dashboard/creators" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Creators
              </Link>
              */}
              <Link href="/dashboard/settings" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Settings
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/dashboard/settings">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/dashboard/brands/new">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Brand
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-5 border border-stone-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Total Brands</p>
                <p className="text-2xl font-semibold text-stone-900 mt-1">{stats.totalBrands}</p>
              </div>
              <FileSpreadsheet className="h-5 w-5 text-stone-400" />
            </div>
          </div>

          <div className="bg-white p-5 border border-stone-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Synced</p>
                <p className="text-2xl font-semibold text-stone-900 mt-1">{stats.syncedBrands}</p>
              </div>
              <BarChart3 className="h-5 w-5 text-green-500" />
            </div>
          </div>

          <div className="bg-white p-5 border border-stone-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Pending Sync</p>
                <p className="text-2xl font-semibold text-stone-900 mt-1">{stats.pendingSync}</p>
              </div>
              <Briefcase className="h-5 w-5 text-amber-500" />
            </div>
          </div>

          {/* HIDDEN: Creators stats widget
          <div className="bg-white p-5 border border-stone-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-600">Creators</p>
                <p className="text-2xl font-semibold text-stone-900 mt-1">{stats.totalCreators}</p>
              </div>
              <Users className="h-5 w-5 text-stone-400" />
            </div>
          </div>
          */}
        </div>

        {/* Main Content - Full Width */}
        <Tabs defaultValue="brands" className="w-full">
          <TabsList className="w-full justify-start bg-white border border-stone-200 p-1 rounded-lg">
            <TabsTrigger value="brands">Brands</TabsTrigger>
            {/* HIDDEN: Creators tab
            <TabsTrigger value="creators">Creators</TabsTrigger>
            */}
          </TabsList>

          <TabsContent value="brands" className="space-y-4 mt-6">
            {brands.length === 0 ? (
              <div className="bg-white p-12 text-center border border-stone-200 rounded-lg">
                <FileSpreadsheet className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <p className="text-stone-600">No brands yet. Connect your first campaign tracker!</p>
                <Link href="/dashboard/brands/new">
                  <Button className="mt-4">Add Brand</Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-4">
                {brands.map((brand) => (
                  <Link key={brand.id} href={`/dashboard/brands/${brand.id}`}>
                    <div className="bg-white p-4 border border-stone-200 rounded-lg hover:shadow-sm transition-shadow">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-stone-900">{brand.name}</h3>
                          {brand.spreadsheetUrl && (
                            <p className="text-sm text-stone-500 mt-1 truncate max-w-md">
                              {brand.spreadsheetUrl}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          {brand.slackChannelName && (
                            <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded">
                              #{brand.slackChannelName}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-1 rounded ${
                            brand.syncStatus === 'synced'
                              ? 'bg-green-100 text-green-800'
                              : brand.syncStatus === 'syncing'
                              ? 'bg-blue-100 text-blue-800'
                              : brand.syncStatus === 'error'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-stone-100 text-stone-600'
                          }`}>
                            {brand.syncStatus}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* HIDDEN: Creators tab content
          <TabsContent value="creators" className="mt-6">
            {creators.length === 0 ? (
              <div className="bg-white p-12 text-center border border-stone-200 rounded-lg">
                <Users className="h-12 w-12 text-stone-300 mx-auto mb-4" />
                <p className="text-stone-600">No creators in your roster yet.</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {creators.map((creator) => (
                  <CreatorCard key={creator.id} creator={creator} />
                ))}
              </div>
            )}
          </TabsContent>
          */}
        </Tabs>
      </div>
    </div>
  )
}
