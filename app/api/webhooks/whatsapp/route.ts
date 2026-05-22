import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhone, sendCapiEvent } from '@/lib/capi'

// Cliente com service role — ignora RLS no processamento de webhooks
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Evolution API envia GET com hub.challenge para verificação do webhook
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (challenge) return new NextResponse(challenge, { status: 200 })
  return NextResponse.json({ ok: true })
}

// POST /api/webhooks/whatsapp
// Recebe eventos CHATS_UPDATE da Evolution API v1.8.2
// Dispara evento Purchase no Facebook CAPI quando label "Comprou" for detectada
export async function POST(req: NextRequest) {
  try {
    // Verificação opcional de segredo do webhook
    const secret = process.env.WEBHOOK_SECRET
    if (secret) {
      const incoming =
        req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')
      if (incoming !== secret) {
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }
    }

    const body = await req.json()

    const event: string = body?.event ?? body?.type ?? ''
    const data = body?.data ?? body

    // Só processa CHATS_UPDATE
    if (event !== 'CHATS_UPDATE' && event !== 'chats.update') {
      return NextResponse.json({ ok: true, ignorado: true, event })
    }

    // Em CHATS_UPDATE o payload pode ser um array ou objeto único
    const chats: unknown[] = Array.isArray(data) ? data : [data]

    for (const chat of chats) {
      const c = chat as Record<string, unknown>

      // JID do contato: "5511999999999@s.whatsapp.net"
      const remoteJid: string =
        (c?.id as string) ?? (c?.remoteJid as string) ?? ''
      if (!remoteJid) continue

      const phoneRaw = remoteJid.split('@')[0]

      // Nome da instância identifica qual cliente enviou o evento
      const instanceName: string =
        (body?.instance as string) ?? (body?.instanceName as string) ?? ''

      const supabase = getServiceClient()

      // Busca o cliente pelo número da instância ou pelo número do WhatsApp
      // Inclui conversion_label para comparar com as etiquetas recebidas
      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, pixel_id, capi_token, whatsapp_number, is_active, conversion_label')
        .or(
          `whatsapp_number.eq.${phoneRaw},whatsapp_number.eq.${instanceName}`
        )
        .eq('is_active', true)
        .single()

      if (clientError || !client) {
        console.error(
          '[webhook] Cliente não encontrado para instância/número:',
          instanceName,
          phoneRaw,
          clientError
        )
        continue
      }

      // Etiqueta configurada pelo admin (padrão: "Comprou") — comparação case-insensitive
      const labelEsperada = (client.conversion_label ?? 'Comprou').toLowerCase().trim()

      const labels: unknown[] = Array.isArray(c?.labels) ? (c.labels as unknown[]) : []
      const temConversao = labels.some(
        (l) =>
          (typeof l === 'string' && l.toLowerCase().trim() === labelEsperada) ||
          (typeof l === 'object' &&
            l !== null &&
            typeof (l as Record<string, unknown>).name === 'string' &&
            ((l as Record<string, unknown>).name as string).toLowerCase().trim() === labelEsperada)
      )

      if (!temConversao) continue

      const phoneHashed = hashPhone(phoneRaw)

      // Salva lead no Supabase com a etiqueta que disparou a conversão
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert({
          client_id: client.id,
          phone_raw: phoneRaw,
          phone_hashed: phoneHashed,
          label: client.conversion_label ?? 'Comprou',
          status: 'converted',
          facebook_event_sent: false,
        })
        .select()
        .single()

      if (leadError || !lead) {
        console.error('[webhook] Erro ao salvar lead:', leadError)
        continue
      }

      // Dispara evento Purchase no Facebook CAPI
      const { success, response: capiResponse } = await sendCapiEvent(
        client.pixel_id,
        client.capi_token,
        phoneHashed
      )

      // Atualiza lead com resultado do CAPI
      await supabase
        .from('leads')
        .update({
          facebook_event_sent: success,
          facebook_event_response: capiResponse,
        })
        .eq('id', lead.id)

      console.log(
        `[webhook] Lead ${lead.id} processado — CAPI enviado: ${success}`
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
