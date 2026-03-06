import Link from 'next/link'
import { ArrowRight, BarChart3, MessageSquare, Users, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-stone-900 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-xl font-semibold text-stone-900">Bloom</span>
          </div>
          <Link href="/dashboard">
            <Button>Get Started</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center space-y-6 max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold text-stone-900 tracking-tight">
            AI-Powered Influencer Marketing Platform
          </h1>
          <p className="text-xl text-stone-600">
            Streamline your influencer marketing operations with intelligent deal management,
            creator matching, and AI-powered insights.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <Link href="/dashboard">
              <Button size="lg">
                Open Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-stone-200">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
              <MessageSquare className="h-6 w-6 text-stone-900" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900">AI Assistant</h3>
            <p className="text-stone-600 text-sm">
              Get instant answers about clients, deals, and creators. Draft emails and receive daily updates.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="h-6 w-6 text-stone-900" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900">Deal Management</h3>
            <p className="text-stone-600 text-sm">
              Track open deals, monitor progress, and manage your entire influencer marketing pipeline.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
              <Users className="h-6 w-6 text-stone-900" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900">Creator Roster</h3>
            <p className="text-stone-600 text-sm">
              Maintain a comprehensive database of creators with detailed profiles and performance metrics.
            </p>
          </div>

          <div className="space-y-3">
            <div className="w-12 h-12 bg-stone-100 rounded-lg flex items-center justify-center">
              <Zap className="h-6 w-6 text-stone-900" />
            </div>
            <h3 className="text-lg font-semibold text-stone-900">Smart Matching</h3>
            <p className="text-stone-600 text-sm">
              AI-powered recommendations for brand-creator partnerships based on archetypes and verticals.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-200 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-center text-sm text-stone-500">
            © 2026 Bloom. AI-powered influencer marketing platform.
          </p>
        </div>
      </footer>
    </div>
  )
}
