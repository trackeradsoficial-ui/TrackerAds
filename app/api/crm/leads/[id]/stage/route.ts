import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { CrmStage } from '@/types'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const stageEventMap: Partial<Record<CrmStage, 'ViewContent' | 'InitiateCheckout' | 'Purchase'>> = {
  qualificando: 'ViewContent',
  proposta:     'InitiateCheckout',
  fechado:      'Purchase',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as { stage: CrmStage; forceCapiConversion?: boolean }
    const { stage, forceCapiConversion } = body
    const supabase = serviceClient()

    const { data: lead, error: fetchErr } = await supabase
      .from('crm_leads')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchErr || !lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    const { error: updateErr } = await supabase
      .from('crm_leads')
      .update({ stage })
      .eq('id', id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    const eventName = stageEventMap[stage]
    const alreadySent = stage === 'fechado' && lead.capi_sent && !forceCapiConversion
    if (eventName && !alreadySent) {
      const eventId = `crm_${eventName}_${lead.id}_${Date.now()}`
      const body = {
        data: [{
          event_name: eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: eventId,
          action_source: 'other',
          user_data: { ph: [lead.phone_hashed] },
          custom_data: eventName === 'Purchase'
            ? { value: lead.sale_value ?? 0, currency: lead.currency ?? 'BRL' }
            : {},
        }],
        access_token: process.env.META_ACCESS_TOKEN,
      }

      await fetch(
        `https://graph.facebook.com/v19.0/${process.env.META_PIXEL_ID}/events`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )

      if (stage === 'fechado') {
        await supabase
          .from('crm_leads')
          .update({ capi_sent: true, capi_event_id: eventId })
          .eq('id', id)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/crm/leads/:id/stage]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
