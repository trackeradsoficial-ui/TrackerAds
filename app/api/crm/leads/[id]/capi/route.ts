import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_EVENTS = ['CompleteRegistration', 'Purchase', 'Lead', 'ViewContent', 'InitiateCheckout']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { event_name } = await req.json() as { event_name: string }

    if (!event_name || !ALLOWED_EVENTS.includes(event_name)) {
      return NextResponse.json({ error: `Evento inválido. Permitidos: ${ALLOWED_EVENTS.join(', ')}` }, { status: 400 })
    }

    const supabase = serviceClient()

    const { data: lead, error: fetchErr } = await supabase
      .from('crm_leads')
      .select('phone_hashed, sale_value, currency')
      .eq('id', id)
      .single()

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    const eventId = `crm_${event_name}_${id}_${Date.now()}`

    const body = {
      data: [{
        event_name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: 'other',
        user_data: { ph: [lead.phone_hashed] },
        custom_data: event_name === 'Purchase'
          ? { value: lead.sale_value ?? 0, currency: lead.currency ?? 'BRL' }
          : {},
      }],
      access_token: process.env.META_ACCESS_TOKEN,
    }

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${process.env.META_PIXEL_ID}/events`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )

    const json = await res.json() as Record<string, unknown>

    if (!res.ok) {
      return NextResponse.json({ error: 'Falha ao enviar ao Facebook CAPI', details: json }, { status: 502 })
    }

    return NextResponse.json({ ok: true, event_id: eventId })
  } catch (e) {
    console.error('[POST /api/crm/leads/:id/capi]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
