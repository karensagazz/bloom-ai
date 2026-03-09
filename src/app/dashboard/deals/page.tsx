import { redirect } from 'next/navigation'

// Deals page - redirecting to dashboard for now
// Brand campaigns are managed through the Brands section
export default function DealsPage() {
  redirect('/dashboard')
}
