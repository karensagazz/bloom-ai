import Link from 'next/link'
import { Plus, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { prisma } from '@/lib/db'

async function getClients() {
  return await prisma.client.findMany({
    include: {
      deals: true,
      _count: {
        select: { deals: true },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

export default async function ClientsPage() {
  const clients = await getClients()

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
              <Link href="/dashboard/clients" className="text-sm font-medium text-stone-900">
                Clients
              </Link>
              <Link href="/dashboard/creators" className="text-sm font-medium text-stone-600 hover:text-stone-900">
                Creators
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-stone-900">Clients</h1>
            <p className="text-stone-600 mt-1">Manage your client relationships</p>
          </div>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {clients.map((client) => (
            <div key={client.id} className="bg-white border border-stone-200 p-6 hover:shadow-sm transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
                  <Building2 className="h-6 w-6 text-stone-600" />
                </div>
                <span className={`text-xs px-2 py-1 rounded ${
                  client.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-stone-100 text-stone-600'
                }`}>
                  {client.status}
                </span>
              </div>

              <h3 className="font-semibold text-stone-900 mb-1">{client.name}</h3>
              <p className="text-sm text-stone-600 mb-4">{client.industry}</p>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-stone-600">Vertical</span>
                  <span className="font-medium text-stone-900">{client.vertical}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-stone-600">Deals</span>
                  <span className="font-medium text-stone-900">{client._count.deals}</span>
                </div>
              </div>

              {client.description && (
                <p className="text-sm text-stone-600 mt-4 line-clamp-2">{client.description}</p>
              )}
            </div>
          ))}
        </div>

        {clients.length === 0 && (
          <div className="bg-white p-12 text-center border border-stone-200">
            <Building2 className="h-12 w-12 text-stone-400 mx-auto mb-4" />
            <p className="text-stone-600">No clients yet. Add your first client to get started!</p>
            <Button className="mt-4">
              <Plus className="h-4 w-4 mr-2" />
              Add Client
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
