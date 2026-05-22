'use client'

import { useState, useEffect, useRef } from 'react'

interface Props {
  token: string
}

type Estado = 'idle' | 'carregando' | 'aguardando' | 'conectado' | 'erro'

export default function QrCodePublic({ token }: Props) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [base64, setBase64] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function pararPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => () => pararPolling(), [])

  function iniciarPolling() {
    pararPolling()
    pollRef.current = setInterval(async () => {
      try {
        // Usa a rota pública — não requer autenticação
        const res = await fetch(`/api/connect/${token}/status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.state === 'open') {
          pararPolling()
          setEstado('conectado')
          setBase64(null)
        }
      } catch {
        // Ignora erros transientes de rede
      }
    }, 3000)
  }

  async function gerarQrCode() {
    setEstado('carregando')
    setErro('')
    setBase64(null)

    try {
      // Usa a rota pública — não requer autenticação
      const res = await fetch(`/api/connect/${token}/qrcode`)
      const data = await res.json()

      if (!res.ok) {
        setEstado('erro')
        setErro(data.error ?? 'Erro ao gerar QR Code.')
        return
      }

      const raw: string | null = data.base64 ?? null
      const b64 = raw ? raw.replace(/^data:image\/[a-z]+;base64,/, '') : null

      if (b64) {
        setBase64(b64)
        setEstado('aguardando')
        iniciarPolling()
      } else {
        setEstado('aguardando')
        iniciarPolling()
      }
    } catch {
      setEstado('erro')
      setErro('Não foi possível conectar. Tente novamente.')
    }
  }

  if (estado === 'conectado') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-base font-semibold text-green-700">WhatsApp conectado!</p>
        <p className="text-sm text-gray-500">Pode fechar esta página.</p>
      </div>
    )
  }

  if (estado === 'aguardando' && base64) {
    return (
      <div className="flex flex-col items-center gap-4 w-full">
        <p className="text-sm text-gray-600 text-center">
          Abra o WhatsApp, toque em <strong>Aparelhos vinculados</strong> e escaneie o código abaixo:
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${base64}`}
          alt="QR Code WhatsApp"
          className="w-56 h-56 border border-gray-200 rounded-xl"
        />
        <p className="text-xs text-gray-400 text-center">Aguardando leitura...</p>
        <button
          onClick={gerarQrCode}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Gerar novo QR Code
        </button>
      </div>
    )
  }

  if (estado === 'aguardando' && !base64) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-gray-500">Gerando QR Code...</p>
      </div>
    )
  }

  if (estado === 'carregando') {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <Spinner />
        <p className="text-sm text-gray-500">Preparando conexão...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {estado === 'erro' && (
        <p className="text-sm text-red-600 text-center bg-red-50 border border-red-200 rounded-lg px-4 py-3 w-full">
          {erro}
        </p>
      )}
      <button
        onClick={gerarQrCode}
        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-6 py-3 rounded-xl transition-colors w-full justify-center"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
        Gerar QR Code
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}
