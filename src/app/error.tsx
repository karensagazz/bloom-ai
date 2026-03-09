'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-stone-900 mb-4">Something went wrong!</h2>
        <p className="text-stone-600 mb-4">
          {error.message || 'An unexpected error occurred'}
        </p>
        <button
          onClick={reset}
          className="w-full px-4 py-2 bg-stone-900 text-white rounded-md hover:bg-stone-800 transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
