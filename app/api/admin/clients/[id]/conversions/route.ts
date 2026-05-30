import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hashPhone, sendCapiEvent } from '@/lib/capi'

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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const phone: string = body?.phone ?? ''

  if (!phone || !/^\d{10,15}$/.test(phone)) {
    return NextResponse.json(
      { error: 'Telefone inválido. Use apenas números, ex: 5511999999999' },
      { status: 400 }
    )
  }

  const supabase = serviceClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('pixel_id, capi_token')
    .eq('id', id)
    .single()

  if (clientError || !client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  if (!client.pixel_id || !client.capi_token) {
    return NextResponse.json(
      { error: 'Pixel ID ou token CAPI não configurado para este cliente' },
      { status: 400 }
    )
  }

  const phoneHashed = hashPhone(phone)

  const { data: lead, error: insertError } = await supabase
    .from('leads')
    .insert({
      client_id:            id,
      phone_raw:            phone,
      phone_hashed:         phoneHashed,
      label:                'Manual',
      status:               'converted',
      facebook_event_sent:  false,
    })
    .select()
    .single()

  if (insertError || !lead) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Erro ao salvar lead' },
      { status: 500 }
    )
  }

  const { success, response } = await sendCapiEvent(
    client.pixel_id,
    client.capi_token,
    phoneHashed
  )

  await supabase
    .from('leads')
    .update({
      facebook_event_sent:     success,
      facebook_event_response: response,
    })
    .eq('id', lead.id)

  if (!success) {
    return NextResponse.json(
      { error: 'Lead salvo, mas falha ao enviar para o Facebook CAPI', details: response },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true })
}
