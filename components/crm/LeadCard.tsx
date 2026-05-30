'use client'

import { Draggable } from '@hello-pangea/dnd'
import type { CrmLead } from '@/types'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'agora'
  if (mins < 60) return `há ${mins}min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `há ${hrs}h`
  return `há ${Math.floor(hrs / 24)}d`
}

function truncate(str: string | null, max = 55): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

interface Props {
  lead: CrmLead
  index: number
  onClick: (lead: CrmLead) => void
}

export default function CrmLeadCard({ lead, index, onClick }: Props) {
  return (
    <Draggable draggableId={String(lead.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          className={`bg-white rounded-xl border border-gray-100 p-3 shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${
            snapshot.isDragging ? 'shadow-lg rotate-1 scale-105' : 'hover:shadow-md'
          }`}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-sm text-gray-800 leading-tight truncate">
              {lead.name ?? lead.phone}
            </p>
            {lead.capi_sent && (
              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                CAPI ✓
              </span>
            )}
          </div>

          {lead.last_message && (
            <p className="text-xs text-gray-400 leading-snug mb-2">{truncate(lead.last_message)}</p>
          )}

          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-gray-300">{timeAgo(lead.updated_at)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClick(lead) }}
              className="text-[10px] text-blue-400 hover:text-blue-600 font-medium transition-colors"
            >
              Ver detalhes →
            </button>
          </div>
        </div>
      )}
    </Draggable>
  )
}
