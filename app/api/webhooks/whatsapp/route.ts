import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

interface ClientRow {
  id: string
  conversion_label_id: string | null
  conversion_label: string | null
  pixel_id: string
  capi_token: string
  whatsapp_instance: string
}

// Resolve número real e nome do contato quando chatId vem como @lid
async function resolverContato(
  chatId: string,
  instance: string
): Promise<{ phone: string; name: string }> {
  const isLid = chatId.endsWith('@lid')

  if (!isLid) {
    // Já é número real: só limpa o sufixo
    const phone = chatId.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    return { phone, name: '' }
  }

  // Chama a Evolution API para buscar o contato pelo @lid
  try {
    const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
    const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

    const res = await fetch(
      `${EVOLUTION_URL}/chat/whatsappNumbers/${instance}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: EVOLUTION_KEY,
        },
        body: JSON.stringify({ numbers: [chatId] }),
      }
    )

    if (res.ok) {
      const data = await res.json()
      // Resposta: [{ exists: true, jid: "5519...@s.whatsapp.net", ... }]
      const entry = Array.isArray(data) ? data[0] : null
      if (entry?.jid) {
        const phone = entry.jid
          .replace('@s.whatsapp.net', '')
          .replace(/\D/g, '')
        const name: string = entry.name || entry.pushName || ''
        console.log(`[webhook] @lid resolvido: ${chatId} → ${phone} (${name})`)
        return { phone, name }
      }
    }

    // Fallback: tenta buscar nos contatos salvos
    const res2 = await fetch(
      `${EVOLUTION_URL}/contacts/fetchContacts/${instance}`,
      {
        method: 'GET',
        headers: { apikey: EVOLUTION_KEY },
      }
    )

    if (res2.ok) {
      const contacts = await res2.json()
      const lidNumber = chatId.replace('@lid', '')
      const found = Array.isArray(contacts)
        ? contacts.find(
            (c: any) =>
              c.id === chatId ||
              c.lid === chatId ||
              c.lid === lidNumber
          )
        : null

      if (found) {
        const phone = (found.remoteJid || found.id || '')
          .replace('@s.whatsapp.net', '')
          .replace(/\D/g, '')
        const name: string = found.pushName || found.name || ''
        console.log(`[webhook] contato encontrado: ${chatId} → ${phone} (${name})`)
        return { phone, name }
      }
    }
  } catch (err: any) {
    console.error(`[webhook] erro ao resolver @lid: ${err.message}`)
  }

  // Último fallback: usa o @lid mesmo (melhor do que nada)
  const phone = chatId.replace('@lid', '').replace(/\D/g, '')
  console.warn(`[webhook] não foi possível resolver @lid, usando bruto: ${phone}`)
  return { phone, name: '' }
}

async function registrarConversao(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  client: ClientRow,
  contactPhone: string,
  contactName: string,
  chatIdRaw: string
): Promise<void> {
  const phoneHashed = crypto
    .createHash('sha256')
    .update(contactPhone)
    .digest('hex')

  const { data: lead, error: insertError } = await supabase
    .from('leads')
    .insert({
      client_id: client.id,
      phone_raw: contactPhone,
      phone_hashed: phoneHashed,
      contact_name: contactName || null,
      chat_id_raw: chatIdRaw,
      label: client.conversion_label || 'Comprou',
      status: 'converted',
      facebook_event_sent: false,
    })
    .select()
    .single()

  if (insertError) {
    console.error(`[webhook] erro ao inserir lead: ${JSON.stringify(insertError)}`)
    return
  }

  console.log(`[webhook] lead inserido: ${lead?.id} | ${contactPhone} | ${contactName}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let capiData: any = null
  try {
    const capiRes = await fetch(
      `https://graph.facebook.com/v19.0/${client.pixel_id}/events`,
      {
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
      }
    )
    capiData = await capiRes.json()
    console.log(`[webhook] CAPI resposta: ${JSON.stringify(capiData)}`)
  } catch (capiErr: any) {
    console.error(`[webhook] erro na chamada CAPI: ${capiErr.message}`)
  }

  const { error: updateError } = await supabase
    .from('leads')
    .update({ facebook_event_sent: true, facebook_event_response: capiData })
    .eq('id', lead?.id)

  if (updateError) {
    console.error('[webhook] erro ao atualizar lead:', updateError.message)
  }

  console.log(
    `[webhook] registrado: ${contactPhone} CAPI:${capiData?.events_received ?? 'erro'}`
  )
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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

    // Resolve número real e nome (faz chamada à Evolution se for @lid)
    const { phone: contactPhone, name: contactName } = await resolverContato(
      chatId,
      instance
    )

    if (!contactPhone) {
      console.error(`[webhook] não foi possível obter telefone para chatId: ${chatId}`)
      return NextResponse.json({ ok: true })
    }

    // ── type=remove ────────────────────────────────────────────────────────
    if (type === 'remove') {
      await supabase
        .from('webhook_events')
        .insert({ client_id: client.id, phone_raw: contactPhone, event_type: 'remove' })

      // Busca por phone_raw OU chat_id_raw para garantir que encontra mesmo
      // se o @lid foi salvo diferente da primeira vez
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('client_id', client.id)
        .eq('status', 'converted')
        .or(`phone_raw.eq.${contactPhone},chat_id_raw.eq.${chatId}`)
        .maybeSingle()

      if (!lead) {
        console.log(`[webhook] remove registrado — sem lead convertido para cancelar: ${contactPhone}`)
        return NextResponse.json({ ok: true })
      }

      await supabase
        .from('leads')
        .update({ status: 'cancelled' })
        .eq('id', lead.id)

      console.log(`[webhook] cancelado: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    // ── type=add ───────────────────────────────────────────────────────────
    await delay(3000)

    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString()

    // Verifica remove recente pelo telefone resolvido
    const { data: recentRemove } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('client_id', client.id)
      .eq('phone_raw', contactPhone)
      .eq('event_type', 'remove')
      .gte('created_at', sixtySecondsAgo)
      .maybeSingle()

    if (recentRemove) {
      console.log(`[webhook] add ignorado — remove detectado nos últimos 60s para: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    // Verifica duplicata por phone_raw OU chat_id_raw
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', client.id)
      .eq('status', 'converted')
      .or(`phone_raw.eq.${contactPhone},chat_id_raw.eq.${chatId}`)
      .maybeSingle()

    if (existingLead) {
      console.log(`[webhook] add ignorado — lead convertido já existe para: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    // Verifica cancelamento recente
    const { data: recentCancelled } = await supabase
      .from('leads')
      .select('id')
      .eq('client_id', client.id)
      .eq('status', 'cancelled')
      .or(`phone_raw.eq.${contactPhone},chat_id_raw.eq.${chatId}`)
      .gte('updated_at', sixtySecondsAgo)
      .maybeSingle()

    if (recentCancelled) {
      console.log(`[webhook] add ignorado — lead cancelado recentemente para: ${contactPhone}`)
      return NextResponse.json({ ok: true })
    }

    await registrarConversao(supabase, client, contactPhone, contactName, chatId)
    return NextResponse.json({ ok: true })

  } catch (e: any) {
    console.error('[webhook] erro:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}