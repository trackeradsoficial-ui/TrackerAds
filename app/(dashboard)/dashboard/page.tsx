import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Lead } from '@/types'
import ConversionsChart from '@/components/ui/ConversionsChart'
import {
  Contact,
  ArrowLeftRight,
  TrendingUp,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function maskPhone(phone: string) {
  if (phone.length < 6) return '***'
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

function buildChartData(leads: Lead[]) {
  const today = new Date()
  const days: Record<string, number> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    days[key] = 0
  }
  for (const lead of leads) {
    if (!lead.facebook_event_sent) continue
    const d = new Date(lead.created_at)
    const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    if (key in days) days[key]++
  }
  return Object.entries(days).map(([date, conversoes]) => ({ date, conversoes }))
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
  if (profile.role === 'admin') redirect('/admin')

  if (!profile.client_id) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <p className="text-sm text-[var(--text-secondary)]">
          Conta não associada a nenhum cliente. Contate o administrador.
        </p>
      </div>
    )
  }

  const { data: client } = await supabase
    .from('clients')
    .select('company_name, is_active, whatsapp_status')
    .eq('id', profile.client_id)
    .single()

  const { data: leads } = await supabase
    .from('leads')
    .select('*')
    .eq('client_id', profile.client_id)
    .eq('status', 'converted')
    .order('created_at', { ascending: false })

  const allLeads       = (leads ?? []) as Lead[]
  const totalLeads     = allLeads.length
  const totalConversions = allLeads.filter((l) => l.facebook_event_sent).length
  const conversionRate = totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0
  const recentLeads    = allLeads.slice(0, 20)
  const chartData      = buildChartData(allLeads)
  const connected      = client?.whatsapp_status === 'connected'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {client?.company_name ?? 'Dashboard'}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Visão geral das suas conversões</p>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-200">
              <Wifi size={12} /> WhatsApp conectado
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[var(--bg-base)] text-[var(--text-muted)] px-3 py-1.5 rounded-full border border-[var(--border)]">
              <WifiOff size={12} /> WhatsApp desconectado
            </span>
          )}
          <span className={`inline-flex items-center text-xs font-semibold px-3 py-1.5 rounded-full ${
            client?.is_active
              ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700'
              : 'bg-[var(--bg-base)] text-[var(--text-muted)]'
          }`}>
            {client?.is_active ? 'Integração ativa' : 'Integração inativa'}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total de Leads"
          value={totalLeads}
          sub="recebidos via WhatsApp"
          icon={<Contact size={18} className="text-blue-500" />}
          bg="bg-blue-50 dark:bg-blue-950"
        />
        <StatCard
          label="Conversões CAPI"
          value={totalConversions}
          sub="eventos enviados ao Facebook"
          icon={<ArrowLeftRight size={18} className="text-[var(--brand)]" />}
          bg="bg-[var(--brand-light)]"
        />
        <StatCard
          label="Taxa de Conversão"
          value={`${conversionRate}%`}
          sub="conversões / leads"
          icon={<TrendingUp size={18} className="text-orange-500" />}
          bg="bg-orange-50 dark:bg-orange-950"
        />
      </div>

      {/* Chart */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversões — Últimos 30 dias</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Eventos CAPI enviados ao Facebook</p>
          </div>
          <span className="text-2xl font-bold text-[var(--brand)]">{totalConversions}</span>
        </div>
        <ConversionsChart data={chartData} />
      </div>

      {/* Recent conversions */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversões Recentes</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Últimas {recentLeads.length} de {totalLeads}</p>
        </div>

        {recentLeads.length === 0 ? (
          <div className="p-10 text-center">
            <ArrowLeftRight size={32} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">Nenhuma conversão registrada ainda.</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Quando um contato for marcado com a etiqueta no WhatsApp, aparecerá aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border)]">
                  <Th>Telefone</Th>
                  <Th>Data</Th>
                  <Th>Status Facebook</Th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map((lead) => (
                  <tr key={lead.id} className="border-t border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors">
                    <Td>
                      <span className="font-mono text-[var(--text-secondary)]">{maskPhone(lead.phone_raw)}</span>
                    </Td>
                    <Td>
                      <span className="text-[var(--text-secondary)] text-xs">
                        {new Date(lead.created_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </Td>
                    <Td>
                      {lead.facebook_event_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={11} /> Enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-full">
                          <XCircle size={11} /> Falhou
                        </span>
                      )}
                    </Td>
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

function StatCard({ label, value, sub, icon, bg }: {
  label: string; value: string | number; sub: string; icon: React.ReactNode; bg: string
}) {
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-xs font-medium text-[var(--text-secondary)] leading-tight">{label}</p>
        <div className={`${bg} p-2 rounded-lg shrink-0`}>{icon}</div>
      </div>
      <p className="text-3xl font-bold text-[var(--text-primary)] leading-none">{value}</p>
      <p className="text-xs text-[var(--text-muted)] mt-1.5">{sub}</p>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3.5">{children}</td>
}
