import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ContactsClient from './ContactsClient'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: clients } = await supabase
    .from('clients')
    .select('id, company_name')
    .order('company_name')

  // All leads (contacts received)
  const { data: leads } = await supabase
    .from('leads')
    .select('id, client_id, phone_raw, created_at, label, facebook_event_sent')
    .order('created_at', { ascending: false })

  return (
    <ContactsClient
      leads={leads ?? []}
      clients={clients ?? []}
    />
  )
}
