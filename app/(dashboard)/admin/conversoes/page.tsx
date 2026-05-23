import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ConversionsClient from './ConversionsClient'

export const dynamic = 'force-dynamic'

export default async function ConversionsPage() {
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

  const { data: leads } = await supabase
    .from('leads')
    .select('id, client_id, phone_raw, label, created_at, facebook_event_sent, facebook_event_response')
    .order('created_at', { ascending: false })

  return (
    <ConversionsClient
      leads={leads ?? []}
      clients={clients ?? []}
    />
  )
}
