import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/clients/[id]/whatsapp/pairingcode
// 1. Garante que a instância existe
// 2. Chama GET /instance/connect/{instanceName}?number={phone} (Evolution API v1.8.2)
// 3. Retorna { pairingCode: "..." }
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  // Busca o número de WhatsApp do cliente no Supabase
  const { data: client, error: clientError } = await serviceClient()
    .from('clients')
    .select('whatsapp_number')
    .eq('id', id)
    .single()

  if (clientError || !client?.whatsapp_number) {
    return NextResponse.json(
      { error: 'Número de WhatsApp do cliente não encontrado' },
      { status: 404 }
    )
  }

  // 1. Garante que a instância existe (ignora 400/403 se já existir)
  const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      instanceName: id,
      token: '',
      qrcode: false,
    }),
  })

  if (!createRes.ok && ![400, 403].includes(createRes.status)) {
    const body = await createRes.text()
    console.error('[pairingcode] Erro ao criar instância:', body)
    return NextResponse.json(
      { error: `Erro ao criar instância: ${body}` },
      { status: 502 }
    )
  }

  // 2. Desconecta a instância atual para garantir estado limpo
  await fetch(`${EVOLUTION_URL}/instance/logout/${id}`, {
    method: 'DELETE',
    headers: { apikey: EVOLUTION_KEY },
  })

  // 3. Aguarda 2 segundos para a instância ser desconectada
  await new Promise((resolve) => setTimeout(resolve, 2000))

  // 4. Solicita o pairing code — GET com number como query param (Evolution API v1.8.2)
  const connectUrl = `${EVOLUTION_URL}/instance/connect/${id}?number=${encodeURIComponent(client.whatsapp_number)}`
  const connectRes = await fetch(connectUrl, {
    method: 'GET',
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!connectRes.ok) {
    const err = await connectRes.text()
    console.error('[pairingcode] Erro ao solicitar pairing code:', err)
    return NextResponse.json(
      { error: `Erro ao gerar código de pareamento: ${err}` },
      { status: 502 }
    )
  }

  const connectData = await connectRes.json()
  // Evolution API v1.8.2 retorna o código diretamente em pairingCode
  const pairingCode: string | null = connectData?.pairingCode ?? null

  if (!pairingCode) {
    console.error('[pairingcode] Código não encontrado:', JSON.stringify(connectData))
    return NextResponse.json(
      { error: 'Código de pareamento não encontrado na resposta', raw: connectData },
      { status: 502 }
    )
  }

  // Atualiza status para "connecting" no Supabase
  await serviceClient()
    .from('clients')
    .update({ whatsapp_status: 'connecting' })
    .eq('id', id)

  return NextResponse.json({ pairingCode })
}
