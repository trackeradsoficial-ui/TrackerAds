'use client'

import { useState, useEffect, useCallback } from 'react'
import { DragDropContext, type DropResult } from '@hello-pangea/dnd'
import { createClient } from '@/lib/supabase/client'
import CrmKanbanColumn from './KanbanColumn'
import CrmLeadDrawer from './LeadDrawer'
import CrmSaleModal from './SaleModal'
import NewLeadModal from './NewLeadModal'
import type { CrmBoard, CrmLead, CrmStage } from '@/types'

const STAGES: CrmStage[] = ['novo', 'qualificando', 'proposta', 'negociando', 'fechado', 'perdido']
const EMPTY_BOARD = Object.fromEntries(STAGES.map((s) => [s, []])) as unknown as CrmBoard

interface PendingDrop {
  lead: CrmLead
  source: DropResult['source']
  destination: NonNullable<DropResult['destination']>
}

export default function CrmKanbanBoard() {
  const [board, setBoard]           = useState<CrmBoard>(EMPTY_BOARD)
  const [loading, setLoading]       = useState(true)
  const [selectedLead, setSelected] = useState<CrmLead | null>(null)
  const [pendingDrop, setPending]   = useState<PendingDrop | null>(null)
  const [showNewLead, setShowNewLead] = useState(false)

  const fetchLeads = useCallback(async () => {
    try {
      const res  = await fetch('/api/crm/leads')
      const data = await res.json() as CrmBoard
      setBoard({ ...EMPTY_BOARD, ...data })
    } catch (e) {
      console.error('Erro ao buscar leads CRM:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLeads()

    const supabase = createClient()
    const channel = supabase
      .channel('crm-leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_leads' }, () => {
        fetchLeads()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchLeads])

  function applyMove(srcStage: CrmStage, dstStage: CrmStage, srcIdx: number, dstIdx: number, lead: CrmLead) {
    setBoard((prev) => {
      const src = [...prev[srcStage]]
      const dst = srcStage === dstStage ? src : [...prev[dstStage]]
      src.splice(srcIdx, 1)
      dst.splice(dstIdx, 0, { ...lead, stage: dstStage })
      return { ...prev, [srcStage]: src, ...(srcStage !== dstStage ? { [dstStage]: dst } : {}) }
    })
  }

  async function moveStage(leadId: number, stage: CrmStage) {
    await fetch(`/api/crm/leads/${leadId}/stage`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  function onDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const srcStage = source.droppableId as CrmStage
    const dstStage = destination.droppableId as CrmStage
    const lead = board[srcStage].find((l) => l.id === Number(draggableId))
    if (!lead) return

    if (dstStage === 'fechado' && lead.sale_value == null) {
      setPending({ lead, source, destination })
      return
    }

    applyMove(srcStage, dstStage, source.index, destination.index, lead)
    moveStage(lead.id, dstStage)
  }

  async function handleSaleConfirm(saleValue: number, currency: string) {
    if (!pendingDrop) return
    const { lead, source, destination } = pendingDrop

    await fetch(`/api/crm/leads/${lead.id}/sale`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sale_value: saleValue, currency }),
    })

    applyMove(source.droppableId as CrmStage, 'fechado', source.index, destination.index, lead)
    await moveStage(lead.id, 'fechado')
    setPending(null)
    await fetchLeads()
  }

  const totalLeads = Object.values(board).reduce((acc, arr) => acc + arr.length, 0)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">CRM — Kanban de Leads</h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">{totalLeads} lead{totalLeads !== 1 ? 's' : ''} no total</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewLead(true)}
            className="bg-white border border-[var(--border)] text-[var(--text-primary)] text-sm px-4 py-1.5 rounded-lg hover:bg-[var(--bg-base)] transition-colors font-medium"
          >
            + Novo Lead
          </button>
          <button
            onClick={fetchLeads}
            className="bg-[var(--brand)] text-white text-sm px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity font-medium"
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Kanban */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <p className="text-[var(--text-muted)] text-sm">Carregando leads...</p>
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <CrmKanbanColumn
                key={stage}
                stage={stage}
                leads={board[stage]}
                onCardClick={setSelected}
              />
            ))}
          </div>
        </DragDropContext>
      )}

      <CrmLeadDrawer lead={selectedLead} onClose={() => setSelected(null)} onRefresh={fetchLeads} />

      {pendingDrop && (
        <CrmSaleModal
          lead={pendingDrop.lead}
          onConfirm={handleSaleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      {showNewLead && (
        <NewLeadModal
          onClose={() => setShowNewLead(false)}
          onCreated={fetchLeads}
        />
      )}
    </div>
  )
}
