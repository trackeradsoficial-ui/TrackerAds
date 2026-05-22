'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Tipos ────────────────────────────────────────────────────

type Aba = 'qrcode' | 'link' | 'codigo'
type Status = 'idle' | 'connecting' | 'awaiting_scan' | 'connected' | 'error'

interface Props {
  clientId: string
  initialStatus?: string // valor do banco: 'connected' | 'disconnected' | 'connecting'
}

// ─── Componente principal ─────────────────────────────────────

export default function WhatsAppConnect({ clientId, initialStatus }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('qrcode')
  const [status, setStatus] = useState<Status>(
    initialStatus === 'connected' ? 'connected' : 'idle'
  )

  // Estado compartilhado de conexão — qualquer aba pode mudar para "connected"
  function onConectado() {
    setStatus('connected')
  }

  async function handleDisconnect() {
    setStatus('idle')
    await fetch(`/api/admin/clients/${clientId}/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disconnect' }),
    })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Conexão WhatsApp</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Escolha como deseja conectar o WhatsApp deste cliente
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Sucesso global */}
      {status === 'connected' && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-medium text-green-700">
            WhatsApp conectado e configurado com sucesso!
          </p>
        </div>
      )}

      {/* Abas — só exibe quando não conectado */}
      {status !== 'connected' && (
        <>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm font-medium">
            {(['qrcode', 'link', 'codigo'] as Aba[]).map((aba) => {
              const labels: Record<Aba, string> = {
                qrcode: 'QR Code',
                link: 'Link',
                codigo: 'Código',
              }
              return (
                <button
                  key={aba}
                  onClick={() => setAbaAtiva(aba)}
                  className={`flex-1 py-2 transition-colors ${
                    abaAtiva === aba
                      ? 'bg-green-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {labels[aba]}
                </button>
              )
            })}
          </div>

          {abaAtiva === 'qrcode' && (
            <AbaQrCode clientId={clientId} onConectado={onConectado} />
          )}
          {abaAtiva === 'link' && (
            <AbaLink clientId={clientId} />
          )}
          {abaAtiva === 'codigo' && (
            <AbaCodigo clientId={clientId} onConectado={onConectado} />
          )}
        </>
      )}

      {/* Botão de desconectar */}
      {status === 'connected' && (
        <button
          onClick={handleDisconnect}
          className="text-sm text-red-600 hover:text-red-700 px-4 py-2.5 rounded-lg border border-red-200 hover:bg-red-50 transition-colors"
        >
          Desconectar
        </button>
      )}
    </div>
  )
}

// ─── Aba 1: QR Code direto ────────────────────────────────────

function AbaQrCode({
  clientId,
  onConectado,
}: {
  clientId: string
  onConectado: () => void
}) {
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'aguardando' | 'erro'>('idle')
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const configurarWebhook = useCallback(async () => {
    try {
      await fetch(`/api/admin/clients/${clientId}/whatsapp/webhook`, { method: 'POST' })
    } catch (err) {
      console.error('Falha ao configurar webhook:', err)
    }
  }, [clientId])

  const iniciarPolling = useCallback(() => {
    pararPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.state === 'open') {
          pararPolling()
          await configurarWebhook()
          onConectado()
        }
      } catch { /* ignora */ }
    }, 3000)
  }, [clientId, pararPolling, configurarWebhook, onConectado])

  useEffect(() => () => pararPolling(), [pararPolling])

  async function gerarQrCode() {
    setEstado('carregando')
    setErro('')
    setQrBase64(null)

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/qrcode`)
      const data = await res.json()

      if (!res.ok) {
        setEstado('erro')
        setErro(data.error ?? 'Erro ao gerar QR Code.')
        return
      }

      const raw: string | null = data.base64 ?? null
      const b64 = raw ? raw.replace(/^data:image\/[a-z]+;base64,/, '') : null

      setQrBase64(b64)
      setEstado('aguardando')
      iniciarPolling()
    } catch {
      setEstado('erro')
      setErro('Erro de conexão. Verifique a Evolution API.')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-gray-500 text-center">
        Gere o QR Code e escaneie com o WhatsApp do cliente diretamente aqui.
      </p>

      {estado === 'erro' && (
        <div className="w-full bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {(estado === 'carregando') && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner />
          <p className="text-sm text-gray-500">Gerando QR Code...</p>
        </div>
      )}

      {estado === 'aguardando' && qrBase64 && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-gray-600 font-medium text-center">
            Escaneie o QR Code com o WhatsApp do cliente:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/png;base64,${qrBase64}`}
            alt="QR Code WhatsApp"
            className="w-56 h-56 border border-gray-200 rounded-lg"
          />
          <p className="text-xs text-gray-400">Aguardando leitura do QR Code...</p>
        </div>
      )}

      {estado === 'aguardando' && !qrBase64 && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner />
          <p className="text-sm text-gray-500">Aguardando QR Code...</p>
        </div>
      )}

      {(estado === 'idle' || estado === 'erro') && (
        <button
          onClick={gerarQrCode}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
        >
          <WhatsAppIcon />
          Gerar QR Code
        </button>
      )}

      {estado === 'aguardando' && (
        <button
          onClick={gerarQrCode}
          className="text-sm text-gray-600 hover:text-gray-900 px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
        >
          Gerar novo QR Code
        </button>
      )}
    </div>
  )
}

// ─── Aba 2: Link público ──────────────────────────────────────

function AbaLink({ clientId }: { clientId: string }) {
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle')
  const [url, setUrl] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')

  async function gerarLink() {
    setEstado('carregando')
    setErro('')
    setUrl('')
    setCopiado(false)

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/link`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        setEstado('erro')
        setErro(data.error ?? 'Erro ao gerar link.')
        return
      }

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
    } catch {
      // fallback: seleciona o campo
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Gere um link público e envie para o cliente. Ele abre a página de conexão sem precisar de login.
      </p>

      {estado === 'erro' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {estado === 'pronto' && url && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-gray-600">Link de conexão:</label>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-700 truncate"
            />
            <button
              onClick={copiar}
              className={`shrink-0 text-sm font-medium px-4 py-2 rounded-lg border transition-colors ${
                copiado
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            O link expira quando um novo for gerado.
          </p>
        </div>
      )}

      <button
        onClick={gerarLink}
        disabled={estado === 'carregando'}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors self-start"
      >
        {estado === 'carregando' ? (
          <><Spinner small /> Gerando...</>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {estado === 'pronto' ? 'Gerar novo link' : 'Gerar link'}
          </>
        )}
      </button>
    </div>
  )
}

// ─── Aba 3: Pairing Code ──────────────────────────────────────

function AbaCodigo({
  clientId,
  onConectado,
}: {
  clientId: string
  onConectado: () => void
}) {
  const [estado, setEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle')
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const configurarWebhook = useCallback(async () => {
    try {
      await fetch(`/api/admin/clients/${clientId}/whatsapp/webhook`, { method: 'POST' })
    } catch (err) {
      console.error('Falha ao configurar webhook:', err)
    }
  }, [clientId])

  const iniciarPolling = useCallback(() => {
    pararPolling()
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.state === 'open') {
          pararPolling()
          await configurarWebhook()
          onConectado()
        }
      } catch { /* ignora */ }
    }, 3000)
  }, [clientId, pararPolling, configurarWebhook, onConectado])

  useEffect(() => () => pararPolling(), [pararPolling])

  async function gerarCodigo() {
    setEstado('carregando')
    setErro('')
    setCodigo('')

    try {
      const res = await fetch(`/api/admin/clients/${clientId}/whatsapp/pairingcode`, {
        method: 'POST',
      })
      const data = await res.json()

      if (!res.ok) {
        setEstado('erro')
        setErro(data.error ?? 'Erro ao gerar código.')
        return
      }

      setCodigo(data.pairingCode)
      setEstado('pronto')
      iniciarPolling()
    } catch {
      setEstado('erro')
      setErro('Erro ao gerar código. Tente novamente.')
    }
  }

  // Formata o código como XXXX-XXXX para facilitar leitura
  function formatarCodigo(c: string) {
    const limpo = c.replace(/\W/g, '').toUpperCase()
    return limpo.length === 8 ? `${limpo.slice(0, 4)}-${limpo.slice(4)}` : c
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500">
        Gere um código de 8 dígitos e envie para o cliente digitar no WhatsApp.
      </p>

      {estado === 'erro' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <p className="text-sm text-red-700">{erro}</p>
        </div>
      )}

      {estado === 'pronto' && codigo && (
        <div className="flex flex-col gap-3">
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-6 py-5 flex flex-col items-center gap-1">
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Código de pareamento</p>
            <p className="text-3xl font-bold tracking-widest text-gray-900 font-mono">
              {formatarCodigo(codigo)}
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-1">
            <p className="text-sm font-medium text-blue-800">Como usar:</p>
            <ol className="text-sm text-blue-700 list-decimal list-inside space-y-0.5">
              <li>Abra o <strong>WhatsApp Business</strong> no celular</li>
              <li>Toque em <strong>Aparelhos vinculados</strong></li>
              <li>Toque em <strong>Vincular com número de telefone</strong></li>
              <li>Digite o código acima</li>
            </ol>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Aguardando digitação do código...
          </p>
        </div>
      )}

      <button
        onClick={gerarCodigo}
        disabled={estado === 'carregando'}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors self-start"
      >
        {estado === 'carregando' ? (
          <><Spinner small /> Gerando...</>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            {estado === 'pronto' ? 'Gerar novo código' : 'Gerar código'}
          </>
        )}
      </button>
    </div>
  )
}

// ─── Subcomponentes utilitários ───────────────────────────────

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; className: string; dot: string }> = {
    idle:          { label: 'Desconectado',     className: 'bg-gray-100 text-gray-500',    dot: 'bg-gray-400'   },
    connecting:    { label: 'Conectando...',     className: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
    awaiting_scan: { label: 'Aguardando scan',  className: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
    connected:     { label: 'Conectado',         className: 'bg-green-100 text-green-700',  dot: 'bg-green-500'  },
    error:         { label: 'Erro',              className: 'bg-red-100 text-red-600',      dot: 'bg-red-500'    },
  }
  const { label, className, dot } = map[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${className}`}>
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

function WhatsAppIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}
