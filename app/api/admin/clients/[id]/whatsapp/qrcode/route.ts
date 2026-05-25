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

// GET /api/admin/clients/[id]/whatsapp/qrcode
// 1. Cria instância (ignora 400/403 se já existir)
// 2. Chama /instance/connect para gerar o QR Code
// 3. Retorna { base64: "..." }
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  // 1. Criar instância — ignora erros se já existir
  const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      instanceName: id,
      integration: 'WHATSAPP-BAILEYS',
    }),
  })

  if (!createRes.ok && ![400, 403].includes(createRes.status)) {
    const body = await createRes.text()
    console.error('[qrcode] Erro ao criar instância:', body)
    return NextResponse.json(
      { error: `Erro ao criar instância: ${body}` },
      { status: 502 }
    )
  }

  if ([400, 403].includes(createRes.status)) {
    console.log(`[qrcode] Instância "${id}" já existe, seguindo para connect.`)
  }

  // 2. Conectar — v2.2.3 retorna { code, base64 }
  // Tenta até 3 vezes com intervalo de 3s (QR Code pode demorar para ser gerado)
  let base64: string | null = null
  for (let i = 0; i < 3; i++) {
    const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${id}`, {
      headers: { apikey: EVOLUTION_KEY },
    })

    if (!connectRes.ok) {
      const err = await connectRes.text()
      console.error(`[qrcode] Erro ao conectar instância (tentativa ${i + 1}):`, err)
      return NextResponse.json(
        { error: `Erro ao obter QR Code: ${err}` },
        { status: 502 }
      )
    }

    const connectData = await connectRes.json()
    base64 = connectData?.base64 || connectData?.qrcode?.base64 || null

    if (base64) break

    console.log(`[qrcode] base64 nulo na tentativa ${i + 1}, aguardando 3s...`)
    await new Promise(r => setTimeout(r, 3000))
  }

  if (!base64) {
    console.error('[qrcode] QR Code não gerado após 3 tentativas')
    return NextResponse.json(
      { error: 'QR Code ainda sendo gerado' },
      { status: 202 }
    )
  }

  // Atualiza status para "connecting" no Supabase
  await serviceClient()
    .from('clients')
    .update({ whatsapp_status: 'connecting' })
    .eq('id', id)

  return NextResponse.json({ base64 })
}
