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
// Creates instance (if needed) and returns QR code base64
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  // 1. Try to create instance (may already exist — that's fine)
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

  if (!createRes.ok) {
    const err = await createRes.text()
    console.warn('Evolution create instance warning:', err)
  }

  // 2. Connect and get QR code
  const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${id}`, {
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!connectRes.ok) {
    const err = await connectRes.text()
    return NextResponse.json(
      { error: `Erro ao obter QR code: ${err}` },
      { status: 502 }
    )
  }

  const connectData = await connectRes.json()

  // Extract base64 from various possible response shapes
  const base64 =
    connectData?.qrcode?.base64 ??
    connectData?.qrcode?.qrcode?.base64 ??
    connectData?.qrcode?.code ??
    connectData?.base64 ??
    null

  // Update status to "connecting" in Supabase
  await serviceClient()
    .from('clients')
    .update({ whatsapp_status: 'connecting' })
    .eq('id', id)

  return NextResponse.json({ base64, raw: connectData })
}
