import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  console.log('[RootPage] user:', user?.email ?? 'null')

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  console.log('[RootPage] profile role:', profile?.role ?? 'null')

  if (profile?.role === 'admin') redirect('/admin')

  redirect('/dashboard')
}
