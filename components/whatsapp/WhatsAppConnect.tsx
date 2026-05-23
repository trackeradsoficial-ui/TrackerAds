'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Wifi, WifiOff, RefreshCw, Link2, Smartphone } from 'lucide-react'

// ─── Tipos ────────────────────────────────────────────────────

type Aba = 'qrcode' | 'link' | 'codigo'
type Status = 'idle' | 'connecting' | 'awaiting_scan' | 'connected' | 'error'

interface Props {
  clientId: string
  initialStatus?: string
}

// ─── Componente principal ─────────────────────────────────────

export default function WhatsAppConnect({ clientId, initialStatus }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('qrcode')
  const [status, setStatus]     = useState<Status>(
    initialStatus === 'connected' ? 'connected' : 'idle'
  )

  function onConectado() { setStatus('connected') }

  async function handleDisconnect() {
    setStatus('idle')
    await fetch(`/api/admin/clients/${clientId}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    })
  }

  const tabs: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'qrcode', label: 'QR Code',  icon: <RefreshCw size={14} /> },
    { id: 'link',   label: 'Link',     icon: <Link2 size={14} />     },
    { id: 'codigo', label: 'Código',   icon: <Smartphone size={14} />},
  ]

  return (
    <div className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <WhatsAppIcon className="w-5 h-5 text-[var(--brand)]" />
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Conexão WhatsApp</h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">Conecte o WhatsApp deste cliente</p>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="p-5 space-y-4">
        {/* Connected state */}
        {status === 'connected' && (
          <div className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl px-4 py-3">
            <Wifi size={18} className="text-emerald-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                WhatsApp conectado com sucesso!
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">
                Conversões serão processadas automaticamente.
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              <WifiOff size={12} /> Desconectar
            </button>
          </div>
        )}

        {/* Tabs */}
        {status !== 'connected' && (
          <>
            <div className="flex rounded-xl border border-[var(--border)] overflow-hidden p-0.5 gap-0.5 bg-[var(--bg-base)]">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setAbaAtiva(tab.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg transition-all duration-150 ${
                    abaAtiva === tab.id
                      ? 'bg-[var(--brand)] text-white shadow-sm'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {abaAtiva === 'qrcode' && <AbaQrCode clientId={clientId} onConectado={onConectado} />}
            {abaAtiva === 'link'   && <AbaLink   clientId={clientId} />}
            {abaAtiva === 'codigo' && <AbaCodigo clientId={clientId} onConectado={onConectado} />}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Aba 1: QR Code ───────────────────────────────────────────

function AbaQrCode({ clientId, onConectado }: { clientId: string; onConectado: () => void }) {
  const [estado, setEstado]   = useState<'idle' | 'carregando' | 'aguardando' | 'erro'>('idle')
  const [qrBase64, setQr]     = useState<string | null>(null)
  const [erro, setErro]       = useState('')
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const configurarWebhook = useCallback(async () => {
    try { await fetch(`/api/admin/clients/${clientId}/whatsapp/webhook`, { method: 'POST' }) }
    catch (err) { console.error(err) }
  }, [clientId])

  const iniciarPolling = useCallback(() => {
    pararPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/clients/${clientId}/whatsapp/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.state === 'open') {
          pararPolling()
          await configurarWebhook()
          onConectado()
        }
      } catch {}
    }, 3000)
  }, [clientId, pararPolling, configurarWebhook, onConectado])

  useEffect(() => () => pararPolling(), [pararPolling])

  async function gerarQrCode() {
    setEstado('carregando')
    setErro('')
    setQr(null)
    try {
      const res  = await fetch(`/api/admin/clients/${clientId}/whatsapp/qrcode`)
      const data = await res.json()
      if (!res.ok) { setEstado('erro'); setErro(data.error ?? 'Erro ao gerar QR Code.'); return }
      const raw = data.base64 as string | null
      const b64 = raw ? raw.replace(/^data:image\/[a-z]+;base64,/, '') : null
      setQr(b64)
      setEstado('aguardando')
      iniciarPolling()
    } catch {
      setEstado('erro')
      setErro('Erro de conexão. Verifique a Evolution API.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-[var(--text-secondary)] text-center">
        Gere o QR Code e escaneie com o WhatsApp do cliente.
      </p>

      {estado === 'erro' && (
        <div className="w-full bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>
        </div>
      )}

      {estado === 'carregando' && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner />
          <p className="text-sm text-[var(--text-muted)]">Gerando QR Code...</p>
        </div>
      )}

      {estado === 'aguardando' && qrBase64 && (
        <div className="flex flex-col items-center gap-3">
          <div className="p-3 bg-white rounded-2xl border border-[var(--border)] shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${qrBase64}`}
              alt="QR Code WhatsApp"
              className="w-52 h-52"
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
            Aguardando leitura do QR Code...
          </p>
        </div>
      )}

      {estado === 'aguardando' && !qrBase64 && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner />
          <p className="text-sm text-[var(--text-muted)]">Aguardando QR Code...</p>
        </div>
      )}

      {(estado === 'idle' || estado === 'erro') && (
        <button
          onClick={gerarQrCode}
          className="flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors"
        >
          <WhatsAppIcon className="w-4 h-4" />
          Gerar QR Code
        </button>
      )}

      {estado === 'aguardando' && (
        <button
          onClick={gerarQrCode}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-4 py-2 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-base)] transition-colors"
        >
          Gerar novo QR Code
        </button>
      )}
    </div>
  )
}

// ─── Aba 2: Link público ──────────────────────────────────────

function AbaLink({ clientId }: { clientId: string }) {
  const [estado,  setEstado]  = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle')
  const [url,     setUrl]     = useState('')
  const [copiado, setCopiado] = useState(false)
  const [erro,    setErro]    = useState('')

  async function gerarLink() {
    setEstado('carregando')
    setErro('')
    setUrl('')
    setCopiado(false)
    try {
      const res  = await fetch(`/api/admin/clients/${clientId}/whatsapp/link`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setEstado('erro'); setErro(data.error ?? 'Erro ao gerar link.'); return }
      setUrl(data.url)
      setEstado('pronto')
    } catch {
      setEstado('erro')
      setErro('Erro ao gerar link. Tente novamente.')
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {}
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Gere um link público e envie para o cliente. Ele abre a página de conexão sem precisar de login.
      </p>

      {estado === 'erro' && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>
        </div>
      )}

      {estado === 'pronto' && url && (
        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Link de conexão:</label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 text-sm border border-[var(--border)] rounded-xl px-3 py-2.5 bg-[var(--bg-base)] text-[var(--text-secondary)] truncate"
            />
            <button
              onClick={copiar}
              className={`shrink-0 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-colors ${
                copiado
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-base)]'
              }`}
            >
              {copiado ? '✓ Copiado' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">O link expira quando um novo for gerado.</p>
        </div>
      )}

      <button
        onClick={gerarLink}
        disabled={estado === 'carregando'}
        className="flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors self-start"
      >
        {estado === 'carregando'
          ? <><Spinner small /> Gerando...</>
          : <><Link2 size={15} />{estado === 'pronto' ? 'Gerar novo link' : 'Gerar link'}</>
        }
      </button>
    </div>
  )
}

// ─── Aba 3: Pairing Code ──────────────────────────────────────

function AbaCodigo({ clientId, onConectado }: { clientId: string; onConectado: () => void }) {
  const [estado,  setEstado]  = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle')
  const [codigo,  setCodigo]  = useState('')
  const [erro,    setErro]    = useState('')
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const configurarWebhook = useCallback(async () => {
    try { await fetch(`/api/admin/clients/${clientId}/whatsapp/webhook`, { method: 'POST' }) }
    catch (err) { console.error(err) }
  }, [clientId])

  const iniciarPolling = useCallback(() => {
    pararPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res  = await fetch(`/api/admin/clients/${clientId}/whatsapp/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.state === 'open') {
          pararPolling()
          await configurarWebhook()
          onConectado()
        }
      } catch {}
    }, 3000)
  }, [clientId, pararPolling, configurarWebhook, onConectado])

  useEffect(() => () => pararPolling(), [pararPolling])

  async function gerarCodigo() {
    setEstado('carregando')
    setErro('')
    setCodigo('')
    try {
      const res  = await fetch(`/api/admin/clients/${clientId}/whatsapp/pairingcode`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setEstado('erro'); setErro(data.error ?? 'Erro ao gerar código.'); return }
      setCodigo(data.pairingCode)
      setEstado('pronto')
      iniciarPolling()
    } catch {
      setEstado('erro')
      setErro('Erro ao gerar código. Tente novamente.')
    }
  }

  function formatarCodigo(c: string) {
    const limpo = c.replace(/\W/g, '').toUpperCase()
    return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : c
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Gere um código de 8 dígitos e envie para o cliente digitar no WhatsApp.
      </p>

      {estado === 'erro' && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>
        </div>
      )}

      {estado === 'pronto' && codigo && (
        <div className="space-y-3">
          <div className="bg-[var(--bg-base)] border border-[var(--border)] rounded-2xl px-6 py-5 flex flex-col items-center gap-2">
            <p className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-widest">Código de pareamento</p>
            <p className="text-4xl font-bold tracking-widest text-[var(--text-primary)] font-mono">
              {formatarCodigo(codigo)}
            </p>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
              Aguardando digitação...
            </p>
          </div>

          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Como usar:</p>
            <ol className="text-xs text-blue-700 dark:text-blue-400 list-decimal list-inside space-y-0.5">
              <li>Abra o <strong>WhatsApp Business</strong> no celular</li>
              <li>Toque em <strong>Aparelhos vinculados</strong></li>
              <li>Toque em <strong>Vincular com número de telefone</strong></li>
              <li>Digite o código acima</li>
            </ol>
          </div>
        </div>
      )}

      <button
        onClick={gerarCodigo}
        disabled={estado === 'carregando'}
        className="flex items-center gap-2 bg-[var(--brand)] hover:bg-[var(--brand-dark)] disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors self-start"
      >
        {estado === 'carregando'
          ? <><Spinner small /> Gerando...</>
          : <><Smartphone size={15} />{estado === 'pronto' ? 'Gerar novo código' : 'Gerar código'}</>
        }
      </button>
    </div>
  )
}

// ─── Utilitários ─────────────────────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string; dot: string }> = {
    idle:          { label: 'Desconectado',    cls: 'bg-[var(--bg-base)] text-[var(--text-muted)]',       dot: 'bg-[var(--text-muted)]' },
    connecting:    { label: 'Conectando...',   cls: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-950',    dot: 'bg-yellow-500 animate-pulse' },
    awaiting_scan: { label: 'Aguardando scan', cls: 'bg-blue-50 text-blue-700 dark:bg-blue-950',          dot: 'bg-blue-500 animate-pulse'  },
    connected:     { label: 'Conectado',       cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950', dot: 'bg-emerald-500'             },
    error:         { label: 'Erro',            cls: 'bg-red-50 text-red-600 dark:bg-red-950',             dot: 'bg-red-500'                 },
  }
  const { label, cls, dot } = map[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border border-current/10 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg className={`animate-spin text-current ${small ? 'w-4 h-4' : 'w-6 h-6'}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
