import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Rota PÚBLICA — não requer autenticação
// Valida o connect_token e gera o QR Code para conexão WhatsApp

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/connect/[token]/qrcode
// 1. Valida o token e obtém o clientId
// 2. Cria instância na Evolution API (ignora 400/403 se já existir)
// 3. Conecta e retorna o QR Code em base64
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Valida o token no banco de dados
  const { data: client, error } = await serviceClient()
    .from('clients')
    .select('id')
    .eq('connect_token', token)
    .single()

  if (error || !client) {
    return NextResponse.json(
      { error: 'Token inválido ou expirado.' },
      { status: 404 }
    )
  }

  const clientId = client.id

  // 1. Criar instância — ignora 400/403 se já existir
  const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      instanceName: clientId,
      token: '',
      qrcode: true,
    }),
  })

  if (!createRes.ok && ![400, 403].includes(createRes.status)) {
    const body = await createRes.text()
    console.error('[connect/qrcode] Erro ao criar instância:', body)
    return NextResponse.json(
      { error: `Erro ao criar instância: ${body}` },
      { status: 502 }
    )
  }

  if ([400, 403].includes(createRes.status)) {
    console.log(`[connect/qrcode] Instância "${clientId}" já existe, seguindo para connect.`)
  }

  // 2. Conectar — Evolution API v1.8.2 retorna base64 diretamente na resposta
  const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${clientId}`, {
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!connectRes.ok) {
    const err = await connectRes.text()
    console.error('[connect/qrcode] Erro ao conectar instância:', err)
    return NextResponse.json(
      { error: `Erro ao obter QR Code: ${err}` },
      { status: 502 }
    )
  }

  const connectData = await connectRes.json()
  const base64 = connectData?.base64 ?? null

  if (!base64) {
    console.error('[connect/qrcode] base64 não encontrado:', JSON.stringify(connectData))
    return NextResponse.json(
      { error: 'QR Code não encontrado na resposta da Evolution API', raw: connectData },
      { status: 502 }
    )
  }

  // Atualiza status para "connecting" no Supabase
  await serviceClient()
    .from('clients')
    .update({ whatsapp_status: 'connecting' })
    .eq('id', clientId)

  return NextResponse.json({ base64 })
}
