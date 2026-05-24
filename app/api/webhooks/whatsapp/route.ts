import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const event = body.event

    if (event !== 'labels.association') {
      return NextResponse.json({ ok: true, ignorado: true, event })
    }

    const type = body.data?.type
    const labelId = body.data?.labelId
    const chatId = body.data?.chatId || ''
    const senderRaw = body.sender || ''
    const instanceName = body.instance || ''
    const senderPhone = senderRaw.replace('@s.whatsapp.net', '')
    const contactPhone = chatId.replace('@s.whatsapp.net', '').replace('@lid', '')

    console.log(`[webhook] type=${type} labelId=${labelId} chatId=${chatId} sender=${senderPhone}`)

    // Busca cliente pelo número do sender
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .or(`whatsapp_number.ilike.%${senderPhone.slice(-9)},whatsapp_instance.eq.${instanceName}`)
      .limit(1)

    if (!clients || clients.length === 0) {
      console.log(`[webhook] cliente não encontrado para ${senderPhone}`)
      return NextResponse.json({ ok: true, resultado: 'cliente não encontrado' })
    }

    const client = clients[0]
    const conversionLabelId = client.conversion_label_id || ''

    if (labelId !== conversionLabelId) {
      console.log(`[webhook] labelId=${labelId} não é o de conversão (${conversionLabelId})`)
      return NextResponse.json({ ok: true, resultado: 'etiqueta não é de conversão' })
    }

    if (type === 'remove') {
      // Cancela a conversão
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')
        .single()

      if (lead) {
        await supabase.from('leads').update({ status: 'cancelled' }).eq('id', lead.id)
        console.log(`[webhook] conversão cancelada: ${contactPhone}`)
      }

      return NextResponse.json({ ok: true, acao: 'cancelado' })
    }

    if (type === 'add') {
      // Verifica duplicata nas últimas 24h
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')
        .gte('created_at', since)
        .single()

      if (existing) {
        console.log(`[webhook] duplicata ignorada: ${contactPhone}`)
        return NextResponse.json({ ok: true, resultado: 'duplicata ignorada' })
      }

      const phoneHashed = crypto.createHash('sha256').update(contactPhone).digest('hex')
      const labelName = client.conversion_label || 'Comprou'

      const { data: lead } = await supabase.from('leads').insert({
        client_id: client.id,
        phone_raw: contactPhone,
        phone_hashed: phoneHashed,
        label: labelName,
        status: 'converted',
        facebook_event_sent: false
      }).select().single()

      console.log(`[webhook] lead salvo: ${lead?.id}`)

      const capiRes = await fetch(
        `https://graph.facebook.com/v19.0/${client.pixel_id}/events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              event_name: 'Purchase',
              event_time: Math.floor(Date.now() / 1000),
              user_data: { ph: [phoneHashed] },
              custom_data: { currency: 'BRL', value: 0 }
            }],
            access_token: client.capi_token
          })
        }
      )

      const capiData = await capiRes.json()
      await supabase.from('leads').update({
        facebook_event_sent: true,
        facebook_event_response: capiData
      }).eq('id', lead?.id)

      console.log(`[webhook] CAPI enviado: ${JSON.stringify(capiData)}`)
      return NextResponse.json({ ok: true, resultado: 'conversão registrada' })
    }

    return NextResponse.json({ ok: true, resultado: 'tipo desconhecido' })

  } catch (e: any) {
    console.error('[webhook] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
