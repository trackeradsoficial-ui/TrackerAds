import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Cache em memória: guarda o timestamp (ms) do último type=add por chave "instance:labelId"
// Usado para detectar removes que são efeito colateral do WhatsApp (chegam logo após um add)
const lastAddTimestamp = new Map<string, number>()
const ADD_GRACE_PERIOD_MS = 10_000 // 10 segundos

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

    // IGNORA TUDO exceto labels.association com type add/remove e campos preenchidos
    if (event !== 'labels.association') {
      return NextResponse.json({ ok: true })
    }
    if (type !== 'add' && type !== 'remove') {
      return NextResponse.json({ ok: true })
    }
    if (!labelId || !chatId || !instance) {
      return NextResponse.json({ ok: true })
    }

    const cacheKey = `${instance}:${labelId}`

    if (type === 'add') {
      lastAddTimestamp.set(cacheKey, Date.now())
    }

    if (type === 'remove') {
      const lastAdd = lastAddTimestamp.get(cacheKey)
      if (lastAdd && Date.now() - lastAdd < ADD_GRACE_PERIOD_MS) {
        console.log(`[webhook] remove ignorado (efeito colateral do WhatsApp) labelId=${labelId} instance=${instance}`)
        return NextResponse.json({ ok: true })
      }
    }

    console.log(`[webhook] labels.association type=${type} labelId=${labelId} chatId=${chatId}`)

    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_instance', instance)
      .limit(1)

    if (!clients || clients.length === 0) {
      return NextResponse.json({ ok: true })
    }

    const client = clients[0]

    if (labelId !== String(client.conversion_label_id || '')) {
      return NextResponse.json({ ok: true })
    }

    const contactPhone = chatId.replace('@s.whatsapp.net', '').replace('@lid', '')

    if (type === 'remove') {
      await supabase.from('leads').update({ status: 'cancelled' })
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')
      console.log(`[webhook] cancelado: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    const { data: existing } = await supabase.from('leads').select('id')
      .eq('client_id', client.id)
      .eq('phone_raw', contactPhone)
      .eq('status', 'converted')
      .maybeSingle()

    if (existing) {
      console.log(`[webhook] duplicata: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    const phoneHashed = crypto.createHash('sha256').update(contactPhone).digest('hex')

    const { data: lead } = await supabase.from('leads').insert({
      client_id: client.id,
      phone_raw: contactPhone,
      phone_hashed: phoneHashed,
      label: client.conversion_label || 'Comprou',
      status: 'converted',
      facebook_event_sent: false
    }).select().single()

    const capiRes = await fetch(`https://graph.facebook.com/v19.0/${client.pixel_id}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{ event_name: 'Purchase', event_time: Math.floor(Date.now() / 1000), user_data: { ph: [phoneHashed] }, custom_data: { currency: 'BRL', value: 0 } }],
        access_token: client.capi_token
      })
    })

    const capiData = await capiRes.json()
    await supabase.from('leads').update({ facebook_event_sent: true, facebook_event_response: capiData }).eq('id', lead?.id)

    console.log(`[webhook] registrado: ${contactPhone} CAPI:${capiData.events_received}`)
    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('[webhook] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
