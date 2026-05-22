'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Status = 'idle' | 'connecting' | 'awaiting_scan' | 'connected' | 'error'

interface Props {
  clientId: string
  initialStatus?: string // valor do banco: 'connected' | 'disconnected' | 'connecting'
}

export default function WhatsAppConnect({ clientId, initialStatus }: Props) {
  const [status, setStatus] = useState<Status>(
    initialStatus === 'connected' ? 'connected' : 'idle'
  )
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  // Poll connection state via server-side status route every 3 seconds
  const startPolling = useCallback(() => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/status`)
        if (!res.ok) return
        const data = await res.json()

        if (data.state === 'open') {
          stopPolling()
          setStatus('connected')
          setQrBase64(null)
        }
      } catch {
        // silently ignore transient errors during polling
      }
    }, 3000)
  }, [clientId, stopPolling])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  async function handleConnect() {
    setStatus('connecting')
    setErrorMsg('')
    setQrBase64(null)

    try {
      // Server-side route calls Evolution API — avoids HTTP/HTTPS mixed content
      const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/qrcode`)
      const data = await res.json()

      if (!res.ok) {
        setStatus('error')
        setErrorMsg(data.error ?? 'Erro ao conectar WhatsApp.')
        return
      }

      // Strip any existing data URI prefix so we never duplicate it
      const raw = data.base64 ?? null
      const base64 = raw
        ? raw.replace(/^data:image\/[a-z]+;base64,/, '')
        : null

      if (base64) {
        setQrBase64(base64)
        setStatus('awaiting_scan')
        startPolling()
      } else {
        // No QR yet — might already be connected or pending
        setStatus('awaiting_scan')
        startPolling()
      }
    } catch {
      setStatus('error')
      setErrorMsg('Erro de conexão. Verifique a Evolution API.')
    }
  }

  async function handleDisconnect() {
    stopPolling()
    setStatus('idle')
    setQrBase64(null)

    await fetch(`/api/admin/clients/${clientId}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Conexão WhatsApp</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Conecte o WhatsApp deste cliente via QR Code
          </p>
        </div>

        {/* Status badge */}
        <StatusBadge status={status} />
      </div>

      {/* QR Code */}
      {status === 'awaiting_scan' && (
        <div className="flex flex-col items-center gap-3 py-2">
          {qrBase64 ? (
            <>
              <p className="text-sm text-gray-600 font-medium">
                Escaneie o QR Code com o WhatsApp do cliente:
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${qrBase64}`}
                alt="QR Code WhatsApp"
                className="w-56 h-56 border border-gray-200 rounded-lg"
              />
              <p className="text-xs text-gray-400">
                Aguardando leitura do QR Code...
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6">
              <Spinner />
              <p className="text-sm text-gray-500">Gerando QR Code...</p>
            </div>
          )}
        </div>
      )}

      {/* Connected success */}
      {status === 'connected' && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-medium text-green-700">
            WhatsApp conectado com sucesso!
          </p>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        {status !== 'connected' && status !== 'awaiting_scan' && (
          <button
            onClick={handleConnect}
            disabled={status === 'connecting'}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {status === 'connecting' ? (
              <>
                <Spinner small />
                Conectando...
              </>
            ) : (
              <>
                <WhatsAppIcon />
                Conectar WhatsApp
              </>
            )}
          </button>
        )}

        {status === 'awaiting_scan' && (
          <button
            onClick={handleConnect}
            className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Gerar novo QR Code
          </button>
        )}

        {status === 'connected' && (
          <button
            onClick={handleDisconnect}
            className="text-sm text-red-600 hover:text-red-700 px-4 py-2.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
          >
            Desconectar
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string }> = {
    idle: { label: 'Desconectado', className: 'bg-gray-100 text-gray-500' },
    connecting: { label: 'Conectando...', className: 'bg-yellow-100 text-yellow-700' },
    awaiting_scan: { label: 'Aguardando scan', className: 'bg-blue-100 text-blue-700' },
    connected: { label: 'Conectado', className: 'bg-green-100 text-green-700' },
    error: { label: 'Erro', className: 'bg-red-100 text-red-600' },
  }

  const { label, className } = map[status]

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${
        status === 'connected' ? 'bg-green-500' :
        status === 'awaiting_scan' ? 'bg-blue-500' :
        status === 'connecting' ? 'bg-yellow-500' :
        status === 'error' ? 'bg-red-500' : 'bg-gray-400'
      }`} />
      {label}
    </span>
  )
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg
      className={`animate-spin text-current ${small ? 'w-4 h-4' : 'w-6 h-6'}`}
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
