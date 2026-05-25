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
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/clients/[id]/whatsapp
// Action: "connect" → cria instância + retorna QR code
// Action: "status"  → retorna estado da conexão
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { action } = await req.json()

  if (action === 'connect') {
    // 1. Cria instância na Evolution API
    const createRes = await fetch(`${EVOLUTION_URL}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({
        instanceName: id,
        integration: 'WHATSAPP-BAILEYS', // v2.2.3
      }),
    })

    if (!createRes.ok) {
      const err = await createRes.text()
      // Instance may already exist — proceed to connect anyway
      console.warn('Evolution create instance warning:', err)
    }

    // 2. Conecta e obtém QR code
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

    // Update status to "connecting" in Supabase
    await serviceClient()
      .from('clients')
      .update({ whatsapp_status: 'connecting' })
      .eq('id', id)

    return NextResponse.json({
      qrcode: connectData.qrcode ?? connectData,
    })
  }

  if (action === 'status') {
    const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${id}`, {
      headers: { apikey: EVOLUTION_KEY },
    })

    if (!stateRes.ok) {
      return NextResponse.json({ state: 'unknown' })
    }

    const stateData = await stateRes.json()
    const state: string = stateData?.instance?.state ?? stateData?.state ?? 'unknown'
    const isOpen = state === 'open'

    if (isOpen) {
      // Salva status + instância para identificação correta no webhook
      await serviceClient()
        .from('clients')
        .update({ whatsapp_status: 'connected', whatsapp_instance: id })
        .eq('id', id)
    }

    return NextResponse.json({ state })
  }

  if (action === 'disconnect') {
    await fetch(`${EVOLUTION_URL}/instance/logout/${id}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_KEY },
    })

    await serviceClient()
      .from('clients')
      .update({ whatsapp_status: 'disconnected', whatsapp_instance: null })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 })
}
