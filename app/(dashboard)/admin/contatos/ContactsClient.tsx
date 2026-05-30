'use client'

import { useState, useMemo } from 'react'
import {
  Contact,
  Search,
  Filter,
  X,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

interface Lead {
  id: string
  client_id: string
  phone_raw: string | null
  created_at: string
  label: string | null
  facebook_event_sent: boolean
}

interface ClientItem {
  id: string
  company_name: string
}

function maskPhone(phone: string | null) {
  if (!phone || phone.length < 6) return '***'
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

// Each unique phone per client is a "contact"; use first seen date
function buildContacts(leads: Lead[], clientMap: Record<string, string>) {
  const seen = new Map<string, {
    phone: string | null
    client_id: string
    clientName: string
    firstContact: string
    converted: boolean
    label: string | null
  }>()

  for (const l of [...leads].reverse()) { // reverse to get first occurrence
    const key = `${l.client_id}::${l.phone_raw ?? ''}`
    if (!seen.has(key)) {
      seen.set(key, {
        phone:        l.phone_raw,
        client_id:    l.client_id,
        clientName:   clientMap[l.client_id] ?? '—',
        firstContact: l.created_at,
        converted:    l.facebook_event_sent,
        label:        l.label,
      })
    } else if (l.facebook_event_sent) {
      const existing = seen.get(key)!
      seen.set(key, { ...existing, converted: true })
    }
  }

  return Array.from(seen.values()).sort(
    (a, b) => new Date(b.firstContact).getTime() - new Date(a.firstContact).getTime()
  )
}

export default function ContactsClient({
  leads,
  clients,
}: {
  leads: Lead[]
  clients: ClientItem[]
}) {
  const [search,       setSearch]       = useState('')
  const [clientFilter, setClientFilter] = useState('')

  const clientMap = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.company_name])),
    [clients]
  )

  const contacts = useMemo(() => buildContacts(leads, clientMap), [leads, clientMap])

  const filtered = useMemo(() => {
    return contacts.filter((c) => {
      if (clientFilter && c.client_id !== clientFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (
          !(c.phone ?? '').toLowerCase().includes(q) &&
          !c.clientName.toLowerCase().includes(q) &&
          !(c.label ?? '').toLowerCase().includes(q)
        ) return false
      }
      return true
    })
  }, [contacts, clientFilter, search])

  const hasFilters = !!(clientFilter || search)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Contatos</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Todos os contatos recebidos via WhatsApp
        </p>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <StatPill label="Total de contatos" value={contacts.length} />
        <StatPill label="Filtrados" value={filtered.length} />
        <StatPill label="Convertidos" value={contacts.filter((c) => c.converted).length} />
      </div>

      {/* Filters */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-4 shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-[var(--text-muted)]" />
          <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Filtros</span>
          {hasFilters && (
            <button
              onClick={() => { setClientFilter(''); setSearch('') }}
              className="ml-auto text-xs text-[var(--text-muted)] hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              placeholder="Buscar por telefone, cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2.5 border border-[var(--border)] rounded-xl text-sm bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder:text-[var(--text-muted)]"
            />
          </div>
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
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-16 text-center">
            <Contact size={36} className="text-[var(--text-muted)] mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--text-secondary)]">Nenhum contato encontrado.</p>
            {hasFilters && (
              <p className="text-xs text-[var(--text-muted)] mt-1">Tente ajustar os filtros.</p>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--bg-base)] border-b border-[var(--border)]">
                    <Th>Telefone</Th>
                    <Th>Cliente</Th>
                    <Th>Etiqueta</Th>
                    <Th>Primeiro Contato</Th>
                    <Th>Convertido</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((contact, i) => (
                    <tr
                      key={i}
                      className="border-t border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors"
                    >
                      <Td>
                        <span className="font-mono text-[var(--text-secondary)]">
                          {maskPhone(contact.phone)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-medium text-[var(--text-primary)]">{contact.clientName}</span>
                      </Td>
                      <Td>
                        {contact.label ? (
                          <span className="text-xs bg-[var(--bg-base)] border border-[var(--border)] px-2 py-0.5 rounded-full text-[var(--text-secondary)]">
                            {contact.label}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="text-[var(--text-secondary)] text-xs whitespace-nowrap">
                          {new Date(contact.firstContact).toLocaleString('pt-BR', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                      </Td>
                      <Td>
                        {contact.converted ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                            <CheckCircle2 size={11} /> Sim
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-muted)] bg-[var(--bg-base)] px-2 py-0.5 rounded-full">
                            <XCircle size={11} /> Não
                          </span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[var(--border)]">
              {filtered.map((contact, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-[var(--bg-base)] border border-[var(--border)] flex items-center justify-center shrink-0">
                    <Contact size={16} className="text-[var(--text-muted)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-sm text-[var(--text-primary)]">{maskPhone(contact.phone)}</p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {contact.clientName} · {new Date(contact.firstContact).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {contact.converted && (
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-base)]">
              <p className="text-xs text-[var(--text-muted)]">
                Exibindo {filtered.length} de {contacts.length} contatos
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="inline-flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border)] rounded-full px-4 py-1.5 shadow-sm">
      <span className="text-xs text-[var(--text-muted)]">{label}:</span>
      <span className="text-sm font-bold text-[var(--text-primary)]">{value}</span>
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
