import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
import ClientEditForm from './ClientEditForm'
import type { Lead } from '@/types'
import ConversionsChart from '@/components/ui/ConversionsChart'
import {
  Contact,
  ArrowLeftRight,
  TrendingUp,
  Send,
  CheckCircle2,
  XCircle,
  ChevronLeft,
} from 'lucide-react'

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

  const allLeads = (leads ?? []) as Lead[]
  const totalLeads    = allLeads.length
  const totalSent     = allLeads.filter((l) => l.facebook_event_sent).length
  const totalFailed   = totalLeads - totalSent
  const convRate      = totalLeads > 0 ? Math.round((totalSent / totalLeads) * 100) : 0
  const recentLeads   = allLeads.slice(0, 20)
  const chartData     = buildChartData(allLeads)

  return (
    <div className="space-y-6">
      {/* Breadcrumb + title */}
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] mb-3 transition-colors"
        >
          <ChevronLeft size={14} /> Clientes
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-light)] flex items-center justify-center shrink-0">
            <span className="text-lg font-bold text-[var(--brand)]">
              {client.company_name.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{client.company_name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">{client.email}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total de Leads"
          value={totalLeads}
          sub="recebidos via WhatsApp"
          icon={<Contact size={18} className="text-blue-500" />}
          bg="bg-blue-50 dark:bg-blue-950"
        />
        <StatCard
          label="Conversões CAPI"
          value={totalSent}
          sub="eventos enviados"
          icon={<Send size={18} className="text-[var(--brand)]" />}
          bg="bg-[var(--brand-light)]"
        />
        <StatCard
          label="Taxa de Conversão"
          value={`${convRate}%`}
          sub="conversões / leads"
          icon={<TrendingUp size={18} className="text-orange-500" />}
          bg="bg-orange-50 dark:bg-orange-950"
        />
        <StatCard
          label="Falhas CAPI"
          value={totalFailed}
          sub="eventos com falha"
          icon={<XCircle size={18} className="text-red-500" />}
          bg="bg-red-50 dark:bg-red-950"
        />
      </div>

      {/* Chart */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversões — Últimos 30 dias</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Eventos CAPI enviados ao Facebook</p>
          </div>
          <span className="text-2xl font-bold text-[var(--brand)]">{totalSent}</span>
        </div>
        <ConversionsChart data={chartData} />
      </div>

      {/* Edit form + WhatsApp */}
      <ClientEditForm client={client} />

      {/* Recent leads */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conversões Recentes</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Últimas {recentLeads.length} de {totalLeads}</p>
        </div>

        {recentLeads.length === 0 ? (
          <div className="p-10 text-center">
            <ArrowLeftRight size={32} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--text-muted)]">Nenhuma conversão registrada ainda.</p>
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
                  <Th>Etiqueta</Th>
                  <Th>CAPI</Th>
                  <Th>Resposta</Th>
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
                      {lead.label ? (
                        <span className="text-xs bg-[var(--bg-base)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text-secondary)]">
                          {lead.label}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
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
                    <Td>
                      <span className="text-xs text-[var(--text-muted)] max-w-xs truncate block">
                        {lead.facebook_event_response ? JSON.stringify(lead.facebook_event_response) : '—'}
                      </span>
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

function StatCard({
  label, value, sub, icon, bg,
}: {
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
    <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3.5">{children}</td>
}
