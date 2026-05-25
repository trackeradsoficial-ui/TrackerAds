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
    const event = body.event
    console.log('[webhook] evento:', event, '| type:', body.data?.type)

    if (event !== 'labels.association' && event !== 'labels.edit') {
      return NextResponse.json({ ok: true, ignorado: true })
    }

    const type = body.data?.type
    const labelId = String(body.data?.labelId || '')
    const chatId = String(body.data?.chatId || '')
    const sender = String(body.sender || '').replace('@s.whatsapp.net', '')
    const instance = String(body.instance || '')

    // Se chatId for @lid, usar o sender como telefone do contato
    const isLid = chatId.endsWith('@lid')
    const contactPhone = isLid ? sender : chatId.replace('@s.whatsapp.net', '')

    console.log(`[webhook] type=${type} labelId=${labelId} contactPhone=${contactPhone} sender=${sender}`)

    // Busca cliente
    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_instance', instance)
      .limit(1)

    if (!clients || clients.length === 0) {
      console.log('[webhook] cliente não encontrado para instance:', instance)
      return NextResponse.json({ ok: true, resultado: 'cliente não encontrado' })
    }

    const client = clients[0]
    const conversionLabelId = String(client.conversion_label_id || '')

    console.log(`[webhook] cliente: ${client.company_name} | conversionLabelId: ${conversionLabelId} | labelId recebido: ${labelId}`)

    if (labelId !== conversionLabelId) {
      return NextResponse.json({ ok: true, resultado: 'etiqueta não é de conversão' })
    }

    if (type === 'remove') {
      await supabase
        .from('leads')
        .update({ status: 'cancelled' })
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')

      console.log('[webhook] conversão cancelada:', contactPhone)
      return NextResponse.json({ ok: true, acao: 'cancelado' })
    }

    if (type !== 'add') {
      return NextResponse.json({ ok: true, resultado: 'tipo ignorado' })
    }

    // Verifica duplicata 24h
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', client.id)
      .eq('phone_raw', contactPhone)
      .eq('status', 'converted')
      .gte('created_at', since)
      .maybeSingle()

    if (existing) {
      console.log('[webhook] duplicata ignorada:', contactPhone)
      return NextResponse.json({ ok: true, resultado: 'duplicata ignorada' })
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

    console.log('[webhook] conversão registrada:', contactPhone, '| CAPI:', capiData.events_received)
    return NextResponse.json({ ok: true, resultado: 'conversão registrada' })

  } catch (e: any) {
    console.error('[webhook] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
