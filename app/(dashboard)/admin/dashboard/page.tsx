import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import ConversionsChart from '@/components/ui/ConversionsChart'
import {
  Users,
  ArrowLeftRight,
  Contact,
  TrendingUp,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

function maskPhone(phone: string) {
  if (phone.length < 6) return '***'
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

function buildChartData(leads: { created_at: string; facebook_event_sent: boolean }[]) {
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

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  // ── Fetch all data ──────────────────────────────────────
  const { data: clients } = await supabase
    .from('clients')
    .select('id, company_name, is_active, whatsapp_status')
    .order('created_at', { ascending: false })

  const { data: allLeads } = await supabase
    .from('leads')
    .select('id, client_id, phone_raw, created_at, facebook_event_sent, label')
    .order('created_at', { ascending: false })

  const leads = allLeads ?? []
  const clientsList = clients ?? []

  // ── Summary stats ───────────────────────────────────────
  const totalClients     = clientsList.filter((c) => c.is_active).length
  const totalConversions = leads.filter((l) => l.facebook_event_sent).length
  const totalLeads       = leads.length
  const conversionRate   = totalLeads > 0 ? Math.round((totalConversions / totalLeads) * 100) : 0

  // ── Chart data (last 30 days conversions) ───────────────
  const chartData = buildChartData(leads)

  // ── Top clients by conversions ──────────────────────────
  const statsMap: Record<string, { name: string; conversions: number; leads: number }> = {}
  for (const c of clientsList) {
    statsMap[c.id] = { name: c.company_name, conversions: 0, leads: 0 }
  }
  for (const l of leads) {
    if (statsMap[l.client_id]) {
      statsMap[l.client_id].leads++
      if (l.facebook_event_sent) statsMap[l.client_id].conversions++
    }
  }
  const topClients = Object.entries(statsMap)
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 5)

  // ── Recent 10 conversions ───────────────────────────────
  const recentConversions = leads
    .filter((l) => l.facebook_event_sent)
    .slice(0, 10)

  const clientMap = Object.fromEntries(clientsList.map((c) => [c.id, c.company_name]))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Dashboard</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Visão geral de todos os clientes</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Clientes Ativos"
          value={totalClients}
          icon={<Users size={20} className="text-[var(--brand)]" />}
          color="brand"
        />
        <SummaryCard
          title="Total de Conversões"
          value={totalConversions}
          icon={<ArrowLeftRight size={20} className="text-purple-500" />}
          color="purple"
        />
        <SummaryCard
          title="Total de Leads"
          value={totalLeads}
          icon={<Contact size={20} className="text-blue-500" />}
          color="blue"
        />
        <SummaryCard
          title="Taxa de Conversão"
          value={`${conversionRate}%`}
          icon={<TrendingUp size={20} className="text-orange-500" />}
          color="orange"
        />
      </div>

      {/* Chart + Top clients */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart */}
        <div className="lg:col-span-2 bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversões — Últimos 30 dias</h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">Eventos CAPI enviados ao Facebook</p>
            </div>
            <span className="text-2xl font-bold text-[var(--brand)]">{totalConversions}</span>
          </div>
          <ConversionsChart data={chartData} />
        </div>

        {/* Top clients */}
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Top Clientes</h2>
          {topClients.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-4 text-center">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-3">
              {topClients.map((c, i) => {
                const rate = c.leads > 0 ? Math.round((c.conversions / c.leads) * 100) : 0
                return (
                  <Link
                    key={c.id}
                    href={`/admin/clients/${c.id}`}
                    className="flex items-center gap-3 group"
                  >
                    <span className="w-5 text-xs font-bold text-[var(--text-muted)]">#{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--brand)] transition-colors">
                        {c.name}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{c.conversions} conversões · {rate}%</p>
                    </div>
                    <ChevronRight size={14} className="text-[var(--text-muted)] shrink-0" />
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent conversions */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversões Recentes</h2>
          <Link
            href="/admin/conversoes"
            className="text-xs font-medium text-[var(--brand)] hover:underline"
          >
            Ver todas →
          </Link>
        </div>

        {recentConversions.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-[var(--text-muted)]">Nenhuma conversão ainda.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-base)]">
                  <Th>Cliente</Th>
                  <Th>Telefone</Th>
                  <Th>Data</Th>
                  <Th>Status CAPI</Th>
                </tr>
              </thead>
              <tbody>
                {recentConversions.map((lead) => (
                  <tr
                    key={lead.id}
                    className="border-t border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors"
                  >
                    <Td>
                      <span className="font-medium text-[var(--text-primary)]">
                        {clientMap[lead.client_id] ?? '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[var(--text-secondary)]">
                        {maskPhone(lead.phone_raw)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[var(--text-secondary)]">
                        {new Date(lead.created_at).toLocaleString('pt-BR', {
                          day: '2-digit', month: '2-digit', year: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </Td>
                    <Td>
                      {lead.facebook_event_sent ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                          <CheckCircle2 size={12} /> Enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-full">
                          <XCircle size={12} /> Falhou
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

// ── Sub-components ──────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  icon,
  color,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
  color: 'brand' | 'purple' | 'blue' | 'orange'
}) {
  const bg: Record<string, string> = {
    brand:  'bg-[var(--brand-light)]',
    purple: 'bg-purple-50 dark:bg-purple-950',
    blue:   'bg-blue-50 dark:bg-blue-950',
    orange: 'bg-orange-50 dark:bg-orange-950',
  }
  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-[var(--text-secondary)] leading-tight">{title}</p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)] leading-none">{value}</p>
        </div>
        <div className={`${bg[color]} p-2.5 rounded-xl shrink-0`}>{icon}</div>
      </div>
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
