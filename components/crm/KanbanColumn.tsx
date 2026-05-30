'use client'

import { Droppable } from '@hello-pangea/dnd'
import CrmLeadCard from './LeadCard'
import type { CrmLead, CrmStage } from '@/types'

const STYLE: Record<CrmStage, { header: string; ring: string }> = {
  novo:         { header: 'bg-gray-500',   ring: 'ring-gray-200'   },
  qualificando: { header: 'bg-blue-500',   ring: 'ring-blue-200'   },
  proposta:     { header: 'bg-yellow-500', ring: 'ring-yellow-200' },
  negociando:   { header: 'bg-orange-500', ring: 'ring-orange-200' },
  fechado:      { header: 'bg-green-500',  ring: 'ring-green-200'  },
  perdido:      { header: 'bg-red-500',    ring: 'ring-red-200'    },
}

const LABELS: Record<CrmStage, string> = {
  novo:         'Novo Lead',
  qualificando: 'Qualificando',
  proposta:     'Proposta',
  negociando:   'Negociando',
  fechado:      'Fechado ✓',
  perdido:      'Perdido ✗',
}

interface Props {
  stage: CrmStage
  leads: CrmLead[]
  onCardClick: (lead: CrmLead) => void
}

export default function CrmKanbanColumn({ stage, leads, onCardClick }: Props) {
  const { header, ring } = STYLE[stage]

  return (
    <div className={`flex flex-col bg-gray-50 rounded-2xl ring-1 ${ring} min-w-[260px] max-w-[280px] flex-shrink-0`}>
      <div className={`${header} rounded-t-2xl px-4 py-2.5 flex items-center justify-between`}>
        <span className="text-white text-sm font-semibold">{LABELS[stage]}</span>
        <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">{leads.length}</span>
      </div>

      <Droppable droppableId={stage}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-1 p-3 space-y-2 min-h-[120px] rounded-b-2xl transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
          >
            {leads.map((lead, index) => (
              <CrmLeadCard key={lead.id} lead={lead} index={index} onClick={onCardClick} />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}
