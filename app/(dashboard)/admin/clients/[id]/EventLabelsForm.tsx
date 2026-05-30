'use client'

import { useState } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'

export interface EventLabel {
  id: string
  label: string
  event_name: 'Purchase' | 'InitiateCheckout' | 'Lead'
}

const EVENT_OPTIONS = [
  { value: 'Purchase',         label: 'Purchase (Compra)' },
  { value: 'InitiateCheckout', label: 'InitiateCheckout (Carrinho)' },
  { value: 'Lead',             label: 'Lead (Cadastro)' },
]

const EVENT_COLORS: Record<string, string> = {
  Purchase:         'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  InitiateCheckout: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  Lead:             'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
}

export default function EventLabelsForm({
  clientId,
  initialMappings,
}: {
  clientId: string
  initialMappings: EventLabel[]
}) {
  const [mappings, setMappings] = useState<EventLabel[]>(initialMappings)
  const [newLabel, setNewLabel] = useState('')
  const [newEvent, setNewEvent] = useState('Purchase')
  const [adding, setAdding]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleAdd() {
    if (!newLabel.trim()) return
    setAdding(true)
    setError(null)

    const res = await fetch(`/api/admin/clients/${clientId}/event-labels`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ label: newLabel.trim(), event_name: newEvent }),
    })

    const json = await res.json()

    if (res.ok) {
      setMappings((prev) => [...prev, json as EventLabel])
      setNewLabel('')
      setNewEvent('Purchase')
    } else {
      setError(json.error ?? 'Erro ao adicionar mapeamento')
    }
    setAdding(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/admin/clients/${clientId}/event-labels`, {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ labelId: id }),
    })
    if (res.ok) setMappings((prev) => prev.filter((m) => m.id !== id))
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--border)]">
        <Tag size={16} className="text-[var(--text-muted)]" />
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Mapeamento de Etiquetas</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Vincule etiquetas do WhatsApp aos eventos do Facebook CAPI</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {mappings.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nenhum mapeamento configurado ainda.</p>
        ) : (
          <ul className="space-y-2">
            {mappings.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-[var(--bg-base)] border border-[var(--border)]">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-[var(--text-primary)] truncate">{m.label}</span>
                  <span className="text-[var(--text-muted)]">→</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${EVENT_COLORS[m.event_name]}`}>
                    {m.event_name}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(m.id)}
                  className="shrink-0 text-[var(--text-muted)] hover:text-red-500 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Adicionar novo */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <input
            type="text"
            placeholder="Nome da etiqueta (ex: Comprou)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder:text-[var(--text-muted)]"
          />
          <select
            value={newEvent}
            onChange={(e) => setNewEvent(e.target.value)}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
          >
            {EVENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !newLabel.trim()}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity whitespace-nowrap"
          >
            <Plus size={14} />
            {adding ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </div>
  )
}
