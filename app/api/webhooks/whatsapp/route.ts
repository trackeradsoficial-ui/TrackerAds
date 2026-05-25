import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await req.json()
    const event = String(body.event || '')
    const type = String(body.data?.type || '')
    const labelId = String(body.data?.labelId || '')
    const chatId = String(body.data?.chatId || '')
    const instance = String(body.instance || '')

    console.log(`[webhook] event=${event} type=${type} labelId=${labelId} chatId=${chatId}`)

    // Só processa labels.association com type add ou remove
    if (event !== 'labels.association') {
      return NextResponse.json({ ok: true, msg: 'evento ignorado' })
    }

    if (type !== 'add' && type !== 'remove') {
      return NextResponse.json({ ok: true, msg: 'type ignorado' })
    }

    if (!labelId || !chatId || !instance) {
      return NextResponse.json({ ok: true, msg: 'dados incompletos' })
    }

    // Busca cliente pela instância
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_instance', instance)
      .limit(1)

    if (!clients || clients.length === 0) {
      console.log(`[webhook] cliente não encontrado para instance=${instance}`)
      return NextResponse.json({ ok: true, msg: 'cliente não encontrado' })
    }

    const client = clients[0]

    // Verifica se é a etiqueta de conversão
    if (labelId !== String(client.conversion_label_id || '')) {
      console.log(`[webhook] labelId=${labelId} não é conversão (esperado=${client.conversion_label_id})`)
      return NextResponse.json({ ok: true, msg: 'etiqueta não é de conversão' })
    }

    // Extrai telefone do contato
    const contactPhone = chatId.replace('@s.whatsapp.net', '').replace('@lid', '')

    if (type === 'remove') {
      await supabase
        .from('leads')
        .update({ status: 'cancelled' })
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')
      console.log(`[webhook] conversão cancelada: ${contactPhone}`)
      return NextResponse.json({ ok: true, msg: 'cancelado' })
    }

    // type === 'add' — verifica duplicata
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', client.id)
      .eq('phone_raw', contactPhone)
      .eq('status', 'converted')
      .maybeSingle()

    if (existing) {
      console.log(`[webhook] duplicata ignorada: ${contactPhone}`)
      return NextResponse.json({ ok: true, msg: 'duplicata' })
    }

    // Salva lead
    const phoneHashed = crypto.createHash('sha256').update(contactPhone).digest('hex')

    const { data: lead } = await supabase.from('leads').insert({
      client_id: client.id,
      phone_raw: contactPhone,
      phone_hashed: phoneHashed,
      label: client.conversion_label || 'Comprou',
      status: 'converted',
      facebook_event_sent: false
    }).select().single()

    // Envia para Facebook CAPI
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

    console.log(`[webhook] conversão registrada: ${contactPhone} | CAPI: ${capiData.events_received}`)
    return NextResponse.json({ ok: true, msg: 'conversão registrada' })

  } catch (e: any) {
    console.error('[webhook] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
