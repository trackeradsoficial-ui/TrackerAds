import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
import ClientEditForm from './ClientEditForm'
import type { Lead } from '@/types'
import Badge from '@/components/ui/Badge'

function maskPhone(phone: string) {
  if (phone.length < 6) return '***'
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: client } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single()

  if (!client) redirect('/admin')

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false })
    .limit(50)

  const totalLeads = leads?.length ?? 0
  const totalSent = leads?.filter((l: Lead) => l.facebook_event_sent).length ?? 0

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{client.company_name}</h1>
        <p className="text-sm text-gray-500 mt-1">Configurações e histórico de conversões</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total de Leads" value={totalLeads} />
        <Stat label="Eventos CAPI Enviados" value={totalSent} />
        <Stat
          label="Taxa de Envio"
          value={totalLeads ? `${Math.round((totalSent / totalLeads) * 100)}%` : '—'}
        />
      </div>

      {/* Edit form */}
      <ClientEditForm client={client} />

      {/* Recent leads */}
      <div>
        <h2 className="text-base font-semibold text-gray-800 mb-4">Conversões Recentes</h2>
        {(leads?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-6">
            Nenhuma conversão registrada ainda.
          </p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">CAPI</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Resposta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(leads as Lead[]).map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700">{maskPhone(lead.phone_raw)}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(lead.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={lead.facebook_event_sent ? 'success' : 'error'}>
                        {lead.facebook_event_sent ? 'Enviado' : 'Falhou'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-xs truncate">
                      {lead.facebook_event_response
                        ? JSON.stringify(lead.facebook_event_response)
                        : '—'}
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
