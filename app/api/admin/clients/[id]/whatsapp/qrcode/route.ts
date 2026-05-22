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
// Evolution API v1.8.2: QR code comes directly from GET /instance/connect/{instanceName}
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  // 1. Create instance — ignore 403 if it already exists
  const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      instanceName: id,
      token: '',
      qrcode: true,
    }),
  })

  if (!createRes.ok && createRes.status !== 403) {
    const createBody = await createRes.text()
    console.error('Evolution create instance error:', createBody)
    return NextResponse.json(
      { error: `Erro ao criar instância: ${createBody}` },
      { status: 502 }
    )
  }

  if (createRes.status === 403) {
    console.log(`Instance "${id}" already exists, proceeding to connect.`)
  }

  // 2. Connect and get QR code — v1.8.2 returns base64 directly in the response
  const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${id}`, {
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!connectRes.ok) {
    const err = await connectRes.text()
    console.error('Evolution connect error:', err)
    return NextResponse.json(
      { error: `Erro ao obter QR code: ${err}` },
      { status: 502 }
    )
  }

  const connectData = await connectRes.json()
  const base64 = connectData?.base64 ?? null

  if (!base64) {
    console.error('QR code base64 not found in response:', JSON.stringify(connectData))
    return NextResponse.json(
      { error: 'QR Code não encontrado na resposta da Evolution API', raw: connectData },
      { status: 502 }
    )
  }

  // Update status to "connecting" in Supabase
  await serviceClient()
    .from('clients')
    .update({ whatsapp_status: 'connecting' })
    .eq('id', id)

  return NextResponse.json({ base64 })
}
