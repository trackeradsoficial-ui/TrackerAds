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

// GET /api/admin/clients/[id]/whatsapp/status
// Returns the current connection state from Evolution API
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${id}`, {
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!stateRes.ok) {
    return NextResponse.json({ state: 'unknown' })
  }

  const stateData = await stateRes.json()
  const state: string =
    stateData?.instance?.state ?? stateData?.state ?? 'unknown'
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
