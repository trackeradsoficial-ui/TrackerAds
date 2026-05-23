import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/ui/Sidebar'

export const dynamic = 'force-dynamic'

function isSupabaseConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  return url && url !== 'your_supabase_project_url' && url.startsWith('http')
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect('/')

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  let companyName: string | undefined

  if (profile.role === 'client' && profile.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('company_name')
      .eq('id', profile.client_id)
      .single()
    companyName = client?.company_name
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg-base)]">
      <Sidebar
        role={profile.role}
        companyName={companyName}
        userEmail={user.email}
      />
      {/* Offset for desktop sidebar width + mobile top bar */}
      <main className="flex-1 lg:ml-60 pt-14 lg:pt-0 min-h-screen overflow-auto">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
