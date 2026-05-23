import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Client } from '@/types'
import {
  Plus,
  Wifi,
  WifiOff,
  ChevronRight,
  Users,
  ArrowLeftRight,
  TrendingUp,
  Building2,
} from 'lucide-react'

export const dynamic = 'force-dynamic'

interface ClientWithStats extends Client {
  lead_count: number
  conversion_count: number
}

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: clients } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

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

  const totalActive = clientsWithStats.filter((c) => c.is_active).length
  const totalConnected = clientsWithStats.filter((c) => c.whatsapp_status === 'connected').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Clientes</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">Gerencie as contas dos seus clientes</p>
        </div>
        <Link
          href="/admin/clients/new"
          className="inline-flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          <Plus size={16} />
          Novo Cliente
        </Link>
      </div>

      {/* Summary mini-cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniCard label="Total" value={clientsWithStats.length} icon={<Building2 size={15} className="text-[var(--brand)]" />} />
        <MiniCard label="Ativos" value={totalActive} icon={<Users size={15} className="text-blue-500" />} />
        <MiniCard label="WhatsApp ✓" value={totalConnected} icon={<Wifi size={15} className="text-emerald-500" />} />
        <MiniCard
          label="Leads total"
          value={clientsWithStats.reduce((a, c) => a + c.lead_count, 0)}
          icon={<ArrowLeftRight size={15} className="text-purple-500" />}
        />
      </div>

      {/* Clients list */}
      {clientsWithStats.length === 0 ? (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-16 text-center">
          <Building2 size={40} className="text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-secondary)] font-medium">Nenhum cliente cadastrado ainda.</p>
          <Link
            href="/admin/clients/new"
            className="mt-4 inline-flex items-center gap-1 text-[var(--brand)] text-sm font-medium hover:underline"
          >
            <Plus size={14} /> Criar primeiro cliente
          </Link>
        </div>
      ) : (
        <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border)]">
                  <Th>Empresa</Th>
                  <Th>WhatsApp</Th>
                  <Th>Leads</Th>
                  <Th>Conversões</Th>
                  <Th>Taxa</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {clientsWithStats.map((client) => {
                  const rate = client.lead_count > 0
                    ? Math.round((client.conversion_count / client.lead_count) * 100)
                    : 0
                  return (
                    <tr
                      key={client.id}
                      className="border-t border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors"
                    >
                      <Td>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">{client.company_name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{client.email}</p>
                        </div>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          {client.whatsapp_status === 'connected' ? (
                            <><Wifi size={14} className="text-emerald-500" /><span className="text-xs text-emerald-600 font-medium">Conectado</span></>
                          ) : (
                            <><WifiOff size={14} className="text-[var(--text-muted)]" /><span className="text-xs text-[var(--text-muted)]">Desconectado</span></>
                          )}
                        </div>
                      </Td>
                      <Td><span className="font-semibold text-[var(--text-primary)]">{client.lead_count}</span></Td>
                      <Td><span className="font-semibold text-[var(--text-primary)]">{client.conversion_count}</span></Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--brand)] rounded-full"
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium text-[var(--text-secondary)]">{rate}%</span>
                        </div>
                      </Td>
                      <Td>
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${
                          client.is_active
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950'
                            : 'bg-[var(--bg-base)] text-[var(--text-muted)]'
                        }`}>
                          {client.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </Td>
                      <Td>
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:text-[var(--brand-dark)] transition-colors"
                        >
                          Gerenciar <ChevronRight size={13} />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-[var(--border)]">
            {clientsWithStats.map((client) => {
              const rate = client.lead_count > 0
                ? Math.round((client.conversion_count / client.lead_count) * 100)
                : 0
              return (
                <Link
                  key={client.id}
                  href={`/admin/clients/${client.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--bg-base)] transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-light)] flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-[var(--brand)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--text-primary)] truncate">{client.company_name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {client.lead_count} leads · {client.conversion_count} conversões · {rate}%
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {client.whatsapp_status === 'connected' ? (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                          <Wifi size={12} /> Conectado
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                          <WifiOff size={12} /> Desconectado
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-muted)] shrink-0" />
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function MiniCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border)] px-4 py-3 flex items-center gap-3 shadow-[var(--shadow-sm)]">
      <div className="p-1.5 rounded-lg bg-[var(--bg-base)]">{icon}</div>
      <div>
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <p className="text-lg font-bold text-[var(--text-primary)] leading-tight">{value}</p>
      </div>
    </div>
  )
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider whitespace-nowrap">
      {children}
    </th>
  )
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-5 py-3.5">{children}</td>
}
