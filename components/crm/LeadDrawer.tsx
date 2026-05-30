'use client'

import { useEffect, useState } from 'react'
import { Pencil, Trash2, CheckCircle2, X, Loader2, AlertCircle, UserCheck } from 'lucide-react'
import type { CrmLead, CrmMessage } from '@/types'

const STAGE_LABELS: Record<string, string> = {
  novo:         'Novo Lead',
  qualificando: 'Qualificando',
  proposta:     'Proposta',
  negociando:   'Negociando',
  fechado:      'Fechado',
  perdido:      'Perdido',
}

const CURRENCY_SYMBOL: Record<string, string> = { BRL: 'R$', USD: '$', EUR: '€' }

function formatDateTime(ts: string) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

interface Props {
  lead: CrmLead | null
  onClose: () => void
  onRefresh: () => void
}

export default function CrmLeadDrawer({ lead, onClose, onRefresh }: Props) {
  const [messages, setMessages]     = useState<CrmMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(false)

  const [editing, setEditing]         = useState(false)
  const [editName, setEditName]       = useState('')
  const [editPhone, setEditPhone]     = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError]     = useState('')

  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // capiLoading armazena o event_name em andamento, ou null
  const [capiLoading, setCapiLoading] = useState<string | null>(null)
  const [capiResult, setCapiResult]   = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (!lead) return
    setEditing(false)
    setConfirmDelete(false)
    setCapiResult(null)
    setEditError('')
    setEditName(lead.name ?? '')
    setEditPhone(lead.phone)

    setMsgLoading(true)
    fetch(`/api/crm/leads/${lead.id}/messages`) // lead é seguro aqui pois está dentro do useEffect com guard
      .then((r) => r.json())
      .then((d) => setMessages(Array.isArray(d) ? d : []))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false))
  }, [lead])

  if (!lead) return null

  const currentLead = lead
  const symbol = CURRENCY_SYMBOL[currentLead.currency ?? 'BRL'] ?? currentLead.currency

  async function handleSaveEdit() {
    setEditError('')
    const digits = editPhone.replace(/\D/g, '')
    if (digits.length < 10 || digits.length > 15) {
      setEditError('Telefone inválido. Use apenas números, ex: 11999990000')
      return
    }
    setEditLoading(true)
    try {
      const res = await fetch(`/api/crm/leads/${currentLead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() || undefined, phone: digits }),
      })
      const json = await res.json()
      if (!res.ok) { setEditError(json.error ?? 'Erro ao salvar'); return }
      setEditing(false)
      onRefresh()
    } catch {
      setEditError('Erro de conexão. Tente novamente.')
    } finally {
      setEditLoading(false)
    }
  }

  async function handleDelete() {
    setDeleteLoading(true)
    try {
      await fetch(`/api/crm/leads/${currentLead.id}`, { method: 'DELETE' })
      onRefresh()
      onClose()
    } catch {
      setDeleteLoading(false)
    }
  }

  async function handleMarkConverted() {
    setCapiResult(null)
    setCapiLoading('Purchase')
    try {
      const res = await fetch(`/api/crm/leads/${currentLead.id}/stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'fechado', forceCapiConversion: true }),
      })
      const json = await res.json()
      if (res.ok) {
        setCapiResult({ ok: true, message: 'Lead marcado como convertido e evento Purchase enviado ao Facebook!' })
        onRefresh()
      } else {
        setCapiResult({ ok: false, message: json.error ?? 'Erro desconhecido' })
      }
    } catch {
      setCapiResult({ ok: false, message: 'Erro de conexão. Tente novamente.' })
    } finally {
      setCapiLoading(null)
    }
  }

  async function handleSendCapi(event_name: string) {
    setCapiResult(null)
    setCapiLoading(event_name)
    try {
      const res = await fetch(`/api/crm/leads/${currentLead.id}/capi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_name }),
      })
      const json = await res.json()
      if (res.ok) {
        setCapiResult({ ok: true, message: `Evento ${event_name} enviado ao Facebook com sucesso!` })
      } else {
        setCapiResult({ ok: false, message: json.error ?? 'Erro desconhecido' })
      }
    } catch {
      setCapiResult({ ok: false, message: 'Erro de conexão. Tente novamente.' })
    } finally {
      setCapiLoading(null)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      <div className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nome (opcional)"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <input
                  type="text"
                  placeholder="Telefone (obrigatório)"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {editError && <p className="text-xs text-red-500">{editError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleSaveEdit}
                    disabled={editLoading}
                    className="flex-1 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {editLoading ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => { setEditing(false); setEditError('') }}
                    className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-bold text-gray-800 text-base truncate">{lead.name ?? lead.phone}</h2>
                {lead.name && <p className="text-xs text-gray-400 mt-0.5">{lead.phone}</p>}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                    {STAGE_LABELS[lead.stage] ?? lead.stage}
                  </span>
                  {lead.capi_sent && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                      CAPI ✓
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {!editing && (
              <>
                <button
                  onClick={() => { setEditing(true); setEditError('') }}
                  title="Editar lead"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Excluir lead"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Confirmação de exclusão */}
        {confirmDelete && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between gap-3">
            <p className="text-xs text-red-700 font-medium">Excluir este lead permanentemente?</p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? 'Excluindo...' : 'Confirmar'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1 rounded-lg border border-red-200 text-red-700 text-xs hover:bg-red-100 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Venda / CAPI info */}
        {(lead.sale_value != null || lead.capi_event_id) && (
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 space-y-1">
            {lead.sale_value != null && (
              <p>
                Valor da venda:{' '}
                <span className="font-semibold text-gray-700">
                  {symbol} {Number(lead.sale_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </p>
            )}
            {lead.capi_event_id && (
              <p className="truncate">Event ID: <span className="font-mono text-gray-600">{lead.capi_event_id}</span></p>
            )}
          </div>
        )}

        {/* Ações CAPI */}
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          {/* Registro Concluído */}
          <button
            onClick={() => handleSendCapi('CompleteRegistration')}
            disabled={capiLoading !== null}
            className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {capiLoading === 'CompleteRegistration'
              ? <><Loader2 size={14} className="animate-spin" /> Enviando ao CAPI...</>
              : <><UserCheck size={14} /> Registro Concluído</>
            }
          </button>

          {/* Marcar como Convertido (Purchase) */}
          {!lead.capi_sent && (
            <button
              onClick={handleMarkConverted}
              disabled={capiLoading !== null}
              className="w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {capiLoading === 'Purchase'
                ? <><Loader2 size={14} className="animate-spin" /> Enviando ao CAPI...</>
                : <><CheckCircle2 size={14} /> Marcar como Convertido</>
              }
            </button>
          )}

          {capiResult && (
            <div className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
              capiResult.ok
                ? 'text-green-700 bg-green-50 border-green-200'
                : 'text-red-700 bg-red-50 border-red-200'
            }`}>
              {capiResult.ok
                ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" />
                : <AlertCircle  size={13} className="mt-0.5 shrink-0" />
              }
              <span>{capiResult.message}</span>
            </div>
          )}
        </div>

        {/* Histórico de mensagens */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
          {msgLoading ? (
            <p className="text-center text-sm text-gray-400 mt-10">Carregando mensagens...</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-gray-400 mt-10">Nenhuma mensagem registrada.</p>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.direction === 'out' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm shadow-sm ${
                  msg.direction === 'out'
                    ? 'bg-green-500 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  <p className="leading-snug">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${msg.direction === 'out' ? 'text-green-100' : 'text-gray-400'}`}>
                    {formatDateTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
