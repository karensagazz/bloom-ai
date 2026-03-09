import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-stone-900 mb-2">Page Not Found</h2>
        <p className="text-stone-600 mb-4">The page you're looking for doesn't exist.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Go to Dashboard
        </Link>
      </div>
    </div>
  )
}
