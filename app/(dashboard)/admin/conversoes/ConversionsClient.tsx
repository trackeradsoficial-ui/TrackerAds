'use client'

import { useState, useMemo } from 'react'
import {
  ArrowLeftRight,
  Download,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react'

interface Lead {
  id: string
  client_id: string
  phone_raw: string
  label: string | null
  created_at: string
  facebook_event_sent: boolean
  facebook_event_response: Record<string, unknown> | null
}

interface ClientItem {
  id: string
  company_name: string
}

function maskPhone(phone: string) {
  if (phone.length < 6) return '***'
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

export default function ConversionsClient({
  leads,
  clients,
}: {
  leads: Lead[]
  clients: ClientItem[]
}) {
  const [search,     setSearch]     = useState('')
  const [clientFilter, setClientFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'sent' | 'failed'>('')
  const [period,     setPeriod]     = useState<'' | '7d' | '30d' | '90d'>('')

  const clientMap = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.company_name])),
    [clients]
  )

  const filtered = useMemo(() => {
    const now = Date.now()
    const periodMs: Record<string, number> = {
      '7d':  7  * 86400000,
      '30d': 30 * 86400000,
      '90d': 90 * 86400000,
    }

    return leads.filter((l) => {
      if (clientFilter && l.client_id !== clientFilter) return false
      if (statusFilter === 'sent'   && !l.facebook_event_sent) return false
      if (statusFilter === 'failed' &&  l.facebook_event_sent) return false
      if (period && periodMs[period]) {
        const age = now - new Date(l.created_at).getTime()
        if (age > periodMs[period]) return false
      }
      if (search) {
        const q = search.toLowerCase()
        const name  = (clientMap[l.client_id] ?? '').toLowerCase()
        const phone = l.phone_raw.toLowerCase()
        const label = (l.label ?? '').toLowerCase()
        if (!name.includes(q) && !phone.includes(q) && !label.includes(q)) return false
      }
      return true
    })
  }, [leads, clientFilter, statusFilter, period, search, clientMap])

  function exportCsv() {
    const header = 'Cliente,Telefone (mascarado),Etiqueta,Data,Status CAPI\n'
    const rows = filtered.map((l) => [
      `"${clientMap[l.client_id] ?? l.client_id}"`,
      maskPhone(l.phone_raw),
      `"${l.label ?? ''}"`,
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.facebook_event_sent ? 'Enviado' : 'Falhou',
    ].join(','))
    const csv  = header + rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `conversoes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasFilters = !!(clientFilter || statusFilter || period || search)
  const totalSent   = filtered.filter((l) =>  l.facebook_event_sent).length
  const totalFailed = filtered.filter((l) => !l.facebook_event_sent).length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Conversões</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Todos os eventos de todos os clientes
          </p>
        </div>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 border border-[var(--border)] text-[var(--text-primary)] text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-[var(--bg-base)] transition-colors shadow-sm"
        >
          <Download size={15} />
          Exportar CSV
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-3">
        <StatPill label="Total filtrado" value={filtered.length} color="text-[var(--text-primary)]" />
        <StatPill label="Enviados" value={totalSent} color="text-emerald-600" />
        <StatPill label="Falhas" value={totalFailed} color="text-red-500" />
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[var(--text-muted)]" />
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Filtros</span>
          {hasFilters && (
            <button
              onClick={() => { setClientFilter(''); setStatusFilter(''); setPeriod(''); setSearch('') }}
              className="ml-auto text-xs text-[var(--text-muted)] hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por cliente, telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder:text-[var(--text-muted)]"
            />
          </div>

          {/* Client filter */}
          <select
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className="px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          >
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.company_name}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | 'sent' | 'failed')}
            className="px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          >
            <option value="">Todos os status</option>
            <option value="sent">Enviado</option>
            <option value="failed">Falhou</option>
          </select>

          {/* Period filter */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as '' | '7d' | '30d' | '90d')}
            className="px-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          >
            <option value="">Todo o período</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="90d">Últimos 90 dias</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <ArrowLeftRight size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">Nenhuma conversão encontrada.</p>
            {hasFilters && (
              <p className="text-xs text-[var(--text-muted)] mt-1">Tente ajustar os filtros.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--bg-base)] border-b border-[var(--border)]">
                  <Th>Cliente</Th>
                  <Th>Telefone</Th>
                  <Th>Etiqueta</Th>
                  <Th>Data</Th>
                  <Th>Status CAPI</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((lead) => (
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
                      {lead.label ? (
                        <span className="text-xs bg-[var(--bg-base)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text-secondary)]">
                          {lead.label}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[var(--text-secondary)] text-xs whitespace-nowrap">
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

            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-base)]">
              <p className="text-xs text-[var(--text-muted)]">
                Exibindo {filtered.length} de {leads.length} conversões
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="inline-flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-4 py-1.5 shadow-sm">
      <span className="text-xs text-[var(--text-muted)]">{label}:</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
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
