import { redirect } from 'next/navigation'

// Clients page has been replaced with Brands
export default function ClientsPage() {
  redirect('/dashboard/brands')
}
