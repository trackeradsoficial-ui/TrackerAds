import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { hashPhone, sendCapiEvent } from '@/lib/capi'

export async function POST(req: NextRequest) {
  // Verify user is authenticated (admin)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { clientId, testEventCode } = await req.json()
  if (!clientId) {
    return NextResponse.json({ error: 'clientId obrigatório' }, { status: 400 })
  }

  // Fetch client with service role to read capi_token
  const serviceClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: client, error } = await serviceClient
    .from('clients')
    .select('pixel_id, capi_token')
    .eq('id', clientId)
    .single()

  if (error || !client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  // Use a test phone number
  const testPhone = '5511999999999'
  const phoneHashed = hashPhone(testPhone)

  const { success, response } = await sendCapiEvent(
    client.pixel_id,
    client.capi_token,
    phoneHashed,
    testEventCode
  )

  return NextResponse.json({ success, response })
}
