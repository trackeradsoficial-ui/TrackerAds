import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
import Badge from '@/components/ui/Badge'
import type { Client } from '@/types'

interface ClientWithStats extends Client {
  lead_count: number
  conversion_count: number
}

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  console.log('[AdminPage] user:', user?.email, '| error:', error?.message)
  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  console.log('[AdminPage] profile:', profile, '| profileError:', profileError?.message)

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  // Fetch lead counts per client
  const { data: leadCounts } = await supabase
    .from('leads')
    .select('client_id, facebook_event_sent')

  const statsMap: Record<string, { total: number; converted: number }> = {}
  for (const lead of (leadCounts ?? [])) {
    if (!statsMap[lead.client_id]) statsMap[lead.client_id] = { total: 0, converted: 0 }
    statsMap[lead.client_id].total++
    if (lead.facebook_event_sent) statsMap[lead.client_id].converted++
  }

  const clientsWithStats: ClientWithStats[] = (clients ?? []).map((c) => ({
    ...c,
    lead_count: statsMap[c.id]?.total ?? 0,
    conversion_count: statsMap[c.id]?.converted ?? 0,
  }))

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie as contas dos seus clientes</p>
        </div>
        <Link
          href="/admin/clients/new"
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + Novo Cliente
        </Link>
      </div>

      {clientsWithStats.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500">Nenhum cliente cadastrado ainda.</p>
          <Link href="/admin/clients/new" className="mt-4 inline-block text-blue-600 text-sm font-medium hover:underline">
            Criar primeiro cliente →
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Empresa</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">WhatsApp</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Leads</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Conversões CAPI</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientsWithStats.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{client.company_name}</p>
                    <p className="text-gray-400 text-xs">{client.email}</p>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{client.whatsapp_number}</td>
                  <td className="px-6 py-4 text-gray-700 font-medium">{client.lead_count}</td>
                  <td className="px-6 py-4 text-gray-700 font-medium">{client.conversion_count}</td>
                  <td className="px-6 py-4">
                    <Badge variant={client.is_active ? 'success' : 'gray'}>
                      {client.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/admin/clients/${client.id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                    >
                      Gerenciar →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
