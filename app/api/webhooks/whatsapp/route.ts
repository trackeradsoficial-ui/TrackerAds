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
    console.log('[webhook] evento recebido:', event, '| type:', body.data?.type)

    // 1. Aceitar apenas labels.association e labels.edit
    if (event !== 'labels.association' && event !== 'labels.edit') {
      console.log('[webhook] evento ignorado:', event)
      return NextResponse.json({ ok: true, resultado: 'evento ignorado' })
    }

    // Log completo do payload do labels.edit para inspecionar o formato
    if (event === 'labels.edit') {
      console.log('[webhook] labels.edit payload completo:', JSON.stringify(body, null, 2))
    }

    // 2. Extrair dados do evento
    const type = String(body.data?.type || '')
    const labelId = String(body.data?.labelId || '')
    const chatId = String(body.data?.chatId || '')
    const instance = String(body.instance || '')

    console.log(`[webhook] type=${type} | labelId=${labelId} | chatId=${chatId} | instance=${instance}`)

    // 3. Ignorar types que não sejam add ou remove
    if (type !== 'add' && type !== 'remove') {
      console.log('[webhook] type ignorado:', type)
      return NextResponse.json({ ok: true, resultado: 'type ignorado' })
    }

    // 4. Extrair telefone do contato a partir do chatId
    const contactPhone = chatId
      .replace('@s.whatsapp.net', '')
      .replace('@lid', '')

    if (!contactPhone) {
      console.log('[webhook] chatId inválido:', chatId)
      return NextResponse.json({ ok: true, resultado: 'chatId inválido' })
    }

    // 5. Buscar cliente pela instância
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

    console.log(`[webhook] cliente: ${client.company_name} | conversionLabelId esperado: ${conversionLabelId} | labelId recebido: ${labelId}`)

    // 6. Verificar se a etiqueta é a de conversão ANTES de qualquer ação
    if (labelId !== conversionLabelId) {
      console.log('[webhook] etiqueta não é de conversão — ignorado')
      return NextResponse.json({ ok: true, resultado: 'etiqueta não é de conversão' })
    }

    // 7. Cancelar conversão do contato específico
    if (type === 'remove') {
      const { error } = await supabase
        .from('leads')
        .update({ status: 'cancelled' })
        .eq('client_id', client.id)
        .eq('phone_raw', contactPhone)
        .eq('status', 'converted')

      if (error) {
        console.error('[webhook] erro ao cancelar:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      console.log('[webhook] conversão cancelada para:', contactPhone)
      return NextResponse.json({ ok: true, resultado: 'conversão cancelada' })
    }

    // 8. Registrar conversão (type === 'add')

    // Verificar duplicata nas últimas 24h
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
      console.log('[webhook] duplicata ignorada para:', contactPhone)
      return NextResponse.json({ ok: true, resultado: 'duplicata ignorada' })
    }

    const phoneHashed = crypto.createHash('sha256').update(contactPhone).digest('hex')

    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        client_id: client.id,
        phone_raw: contactPhone,
        phone_hashed: phoneHashed,
        label: client.conversion_label || 'Comprou',
        status: 'converted',
        facebook_event_sent: false
      })
      .select()
      .single()

    if (insertError) {
      console.error('[webhook] erro ao inserir lead:', insertError.message)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Enviar evento ao CAPI do Facebook
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

    await supabase
      .from('leads')
      .update({
        facebook_event_sent: true,
        facebook_event_response: capiData
      })
      .eq('id', lead?.id)

    console.log('[webhook] conversão registrada para:', contactPhone, '| CAPI eventos recebidos:', capiData.events_received)
    return NextResponse.json({ ok: true, resultado: 'conversão registrada' })

  } catch (e: any) {
    console.error('[webhook] erro inesperado:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
