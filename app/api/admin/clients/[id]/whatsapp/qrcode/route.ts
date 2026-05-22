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

  // 1. Create instance — ignore 403 if it already exists
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
    const createBody = await createRes.text()
    // 400 / 403 / 409 all indicate the instance already exists — proceed
    if (![400, 403, 409].includes(createRes.status)) {
      console.error('Evolution create instance error:', createBody)
      return NextResponse.json(
        { error: `Erro ao criar instância: ${createBody}` },
        { status: 502 }
      )
    }
    console.log(`Instance "${id}" already exists (${createRes.status}), proceeding to connect.`)
  }

  // 2. Trigger the connect flow (starts QR code generation)
  const connectRes = await fetch(`${EVOLUTION_URL}/instance/connect/${id}`, {
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!connectRes.ok) {
    const err = await connectRes.text()
    console.error('Evolution connect error:', err)
    return NextResponse.json(
      { error: `Erro ao iniciar conexão: ${err}` },
      { status: 502 }
    )
  }

  // 3. Wait 3 seconds for the QR code to be generated
  await new Promise((resolve) => setTimeout(resolve, 3000))

  // 4. Fetch the instance data — QR code is available here in v2.2.3
  const fetchRes = await fetch(
    `${EVOLUTION_URL}/instance/fetchInstances?instanceName=${encodeURIComponent(id)}`,
    { headers: { apikey: EVOLUTION_KEY } }
  )

  if (!fetchRes.ok) {
    const err = await fetchRes.text()
    console.error('Evolution fetchInstances error:', err)
    return NextResponse.json(
      { error: `Erro ao buscar instância: ${err}` },
      { status: 502 }
    )
  }

  const instances = await fetchRes.json()

  // Response is an array; grab the first matching instance
  const instance = Array.isArray(instances) ? instances[0] : instances

  const base64 =
    instance?.qrcode?.base64 ??
    instance?.qrcode?.pairingCode ??
    null

  if (!base64) {
    console.warn('QR code not ready yet:', JSON.stringify(instance?.qrcode ?? instance))
    return NextResponse.json(
      { error: 'QR Code ainda sendo gerado, tente novamente' },
      { status: 202 }
    )
  }

  // Update status to "connecting" in Supabase
  await serviceClient()
    .from('clients')
    .update({ whatsapp_status: 'connecting' })
    .eq('id', id)

  return NextResponse.json({ base64 })
}
