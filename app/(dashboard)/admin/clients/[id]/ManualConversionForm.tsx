'use client'

import { useState } from 'react'
import { PhoneCall, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

export default function ManualConversionForm({ clientId }: { clientId: string }) {
  const [phone,   setPhone]   = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<{ ok: boolean; message: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setResult(null)

    const digits = phone.replace(/\D/g, '')
    if (!digits || digits.length < 10 || digits.length > 15) {
      setResult({ ok: false, message: 'Telefone inválido. Use apenas números, ex: 5511999999999' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/conversions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ phone: digits }),
      })

      const json = await res.json()

      if (res.ok) {
        setResult({ ok: true, message: 'Conversão registrada e enviada ao Facebook!' })
        setPhone('')
      } else {
        setResult({ ok: false, message: json.error ?? 'Erro desconhecido' })
      }
    } catch {
      setResult({ ok: false, message: 'Erro de conexão. Tente novamente.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="bg-[var(--brand-light)] p-2 rounded-lg">
          <PhoneCall size={16} className="text-[var(--brand)]" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Registrar Conversão Manual</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">Envie um evento Purchase para o Facebook CAPI manualmente</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="5511999999999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--border)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !phone.trim()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-[var(--brand)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity shrink-0"
        >
          {loading ? (
            <><Loader2 size={14} className="animate-spin" /> Enviando...</>
          ) : (
            'Marcar como Convertido'
          )}
        </button>
      </form>

      {result && (
        <div className={`mt-3 flex items-start gap-2 text-sm px-3 py-2.5 rounded-lg border ${
          result.ok
            ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800'
            : 'text-red-700 bg-red-50 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
        }`}>
          {result.ok
            ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            : <AlertCircle  size={15} className="mt-0.5 shrink-0" />
          }
          <span>{result.message}</span>
        </div>
      )}
    </div>
  )
}
