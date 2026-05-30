'use client'

import { useState } from 'react'
import type { CrmLead } from '@/types'

interface Props {
  lead: CrmLead
  onConfirm: (saleValue: number, currency: string) => Promise<void>
  onCancel: () => void
}

export default function CrmSaleModal({ lead, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('BRL')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    const num = parseFloat(value)
    if (!num || num <= 0) return
    setLoading(true)
    await onConfirm(num, currency)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-1">Confirmar venda</h2>
        <p className="text-sm text-gray-500 mb-5">
          Informe o valor da venda para{' '}
          <span className="font-semibold text-gray-700">{lead.name ?? lead.phone}</span>.
          O evento <strong>Purchase</strong> será enviado ao Facebook CAPI.
        </p>

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Valor</label>
        <input
          type="number"
          min="0"
          step="0.01"
          placeholder="Ex: 1500.00"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-400"
        />

        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Moeda</label>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="BRL">BRL — Real</option>
          <option value="USD">USD — Dólar</option>
          <option value="EUR">EUR — Euro</option>
        </select>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!value || loading}
            className="flex-1 py-2 rounded-lg bg-green-500 text-white text-sm font-semibold hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Enviando...' : 'Confirmar e enviar ao CAPI'}
          </button>
        </div>
      </div>
    </div>
  )
}
