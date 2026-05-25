import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'


interface ClientRow {
  id: string
  conversion_label_id: string | null
  conversion_label: string | null
  pixel_id: string
  capi_token: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function registrarConversao(
  supabase: any,
  client: ClientRow,
  contactPhone: string
): Promise<void> {
  // Ignorar se já existe um lead convertido criado nos últimos 5 segundos (duplicata rápida)
  const fiveSecondsAgo = new Date(Date.now() - 5_000).toISOString()
  const { data: existing } = await supabase
    .from('leads')
    .select('id, created_at')
    .eq('client_id', client.id)
    .eq('phone_raw', contactPhone)
    .eq('status', 'converted')
    .gte('created_at', fiveSecondsAgo)
    .maybeSingle()

  if (existing) {
    console.log(`[webhook] duplicata recente ignorada: ${contactPhone}`)
    return
  }

  const phoneHashed = crypto.createHash('sha256').update(contactPhone).digest('hex')

  const { data: lead } = await supabase
    .from('leads')
    .insert({
      client_id: client.id,
      phone_raw: contactPhone,
      phone_hashed: phoneHashed,
      label: client.conversion_label || 'Comprou',
      status: 'converted',
      facebook_event_sent: false,
    })
    .select()
    .single()

  const capiRes = await fetch(`https://graph.facebook.com/v19.0/${client.pixel_id}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: [
        {
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          user_data: { ph: [phoneHashed] },
          custom_data: { currency: 'BRL', value: 0 },
        },
      ],
      access_token: client.capi_token,
    }),
  })

  const capiData = await capiRes.json()
  await supabase
    .from('leads')
    .update({ facebook_event_sent: true, facebook_event_response: capiData })
    .eq('id', lead?.id)

  console.log(`[webhook] registrado: ${contactPhone} CAPI:${capiData.events_received}`)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await req.json()
    console.log('[webhook] PAYLOAD COMPLETO:', JSON.stringify(body))

    const event = String(body.event || '')
    const instance = String(body.instance || '')

    // ── chats.update ────────────────────────────────────────────────────────
    if (event === 'chats.update') {
      const chats = Array.isArray(body.data) ? body.data : []

      if (chats.length === 0) return NextResponse.json({ ok: true })

      const { data: clients } = await supabase
        .from('clients')
        .select('*')
        .eq('whatsapp_instance', instance)
        .limit(1)

      if (!clients || clients.length === 0) return NextResponse.json({ ok: true })

      const client = clients[0] as ClientRow
      const conversionLabelId = String(client.conversion_label_id || '')

      for (const chat of chats) {
        const labels: Array<{ id?: string }> = Array.isArray(chat.labels) ? chat.labels : []
        const hasLabel = labels.some((l) => String(l?.id ?? '') === conversionLabelId)

        if (!hasLabel) continue

        const rawId: string = String(chat.id || '')
        const contactPhone = rawId.replace('@s.whatsapp.net', '').replace('@lid', '')

        if (!contactPhone) continue

        console.log(`[webhook] chats.update com label de conversão: ${contactPhone}`)
        await registrarConversao(supabase, client, contactPhone)
      }

      return NextResponse.json({ ok: true })
    }

    // ── labels.association / labels.edit ─────────────────────────────────────
    const type = String(body.data?.type || '')
    const labelId = String(body.data?.labelId || '')
    const chatId = String(body.data?.chatId || '')

    if (event !== 'labels.association' && event !== 'labels.edit') {
      return NextResponse.json({ ok: true })
    }
    if (type !== 'add' && type !== 'remove') {
      return NextResponse.json({ ok: true })
    }
    if (!labelId || !chatId || !instance) {
      return NextResponse.json({ ok: true })
    }

    console.log(`[webhook] ${event} type=${type} labelId=${labelId} chatId=${chatId}`)

    const { data: clients } = await supabase
      .from('clients')
      .select('*')
      .eq('whatsapp_instance', instance)
      .limit(1)

    if (!clients || clients.length === 0) return NextResponse.json({ ok: true })

    const client = clients[0] as ClientRow

    if (labelId !== String(client.conversion_label_id || '')) {
      return NextResponse.json({ ok: true })
    }

    const contactPhone = chatId.replace('@s.whatsapp.net', '').replace('@lid', '')

    if (type === 'remove') {
      // Só cancela se existir lead convertido para esse contato
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')
        .maybeSingle()

      if (!lead) {
        console.log(`[webhook] remove ignorado — sem lead convertido para: ${contactPhone}`)
        return NextResponse.json({ ok: true })
      }

      await supabase
        .from('leads')
        .update({ status: 'cancelled' })
        .eq('id', lead.id)

      console.log(`[webhook] cancelado: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    await registrarConversao(supabase, client, contactPhone)
    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('[webhook] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
