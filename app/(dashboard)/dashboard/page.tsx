import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import type { Lead } from '@/types'

function maskPhone(phone: string) {
  if (phone.length < 6) return '***'
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, client_id')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Admin redirects to their own panel
  if (profile.role === 'admin') redirect('/admin')

  if (!profile.client_id) {
    return (
      <div className="text-sm text-gray-500">
        Conta não associada a nenhum cliente. Contate o administrador.
      </div>
    )
  }

  const { data: client } = await supabase
    .from('clients')
    .select('company_name, is_active')
    .eq('id', profile.client_id)
    .single()

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('client_id', profile.client_id)
    .order('created_at', { ascending: false })

  const allLeads = (leads ?? []) as Lead[]
  const totalLeads = allLeads.length
  const totalConversions = allLeads.filter((l) => l.facebook_event_sent).length
  const conversionRate = totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0
  const recentLeads = allLeads.slice(0, 20)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{client?.company_name ?? 'Dashboard'}</h1>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-sm text-gray-500">Visão geral das suas conversões</p>
          {client && (
            <Badge variant={client.is_active ? 'success' : 'gray'}>
              {client.is_active ? 'Integração ativa' : 'Integração inativa'}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total de Leads" value={totalLeads} sub="recebidos via WhatsApp" />
        <StatCard label="Conversões Enviadas" value={totalConversions} sub="eventos enviados ao Facebook" />
        <StatCard label="Taxa de Conversão" value={`${conversionRate}%`} sub="conversões / leads" />
      </div>

      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-4">Conversões Recentes</h2>
        {recentLeads.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-400 text-sm">Nenhuma conversão registrada ainda.</p>
            <p className="text-gray-400 text-xs mt-1">
              Quando um contato for marcado com a etiqueta &quot;Comprou&quot; no WhatsApp, ele aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Telefone</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status Facebook</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-gray-700">{maskPhone(lead.phone_raw)}</td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(lead.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant={lead.facebook_event_sent ? 'success' : 'error'}>
                        {lead.facebook_event_sent ? 'Enviado' : 'Falhou'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
