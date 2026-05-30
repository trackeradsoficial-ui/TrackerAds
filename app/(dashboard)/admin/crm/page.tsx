import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CrmKanbanBoard from '@/components/crm/KanbanBoard'

export const dynamic = 'force-dynamic'

export default async function CrmPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="space-y-0">
      <CrmKanbanBoard />
    </div>
  )
}
