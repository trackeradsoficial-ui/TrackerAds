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
// Dispara evento Purchase no Facebook CAPI quando a etiqueta de conversão for detectada
export async function POST(req: NextRequest) {
  try {
    // Verificação opcional de segredo do webhook
    const secret = process.env.WEBHOOK_SECRET
    if (secret) {
      const incoming =
        req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')
      if (incoming !== secret) {
        console.warn('[webhook] Requisição rejeitada — segredo inválido')
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }
    }

    const body = await req.json()

    // ── LOG 1: body completo recebido ─────────────────────────────────────────
    console.log('[webhook] ✉️  Payload recebido:', JSON.stringify(body, null, 2))

    const event: string = body?.event ?? body?.type ?? ''
    const data = body?.data ?? body

    console.log(`[webhook] 📌 Evento identificado: "${event}"`)

    // Só processa CHATS_UPDATE
    if (event !== 'CHATS_UPDATE' && event !== 'chats.update') {
      console.log(`[webhook] ⏭️  Evento ignorado (esperado: CHATS_UPDATE): "${event}"`)
      return NextResponse.json({ ok: true, ignorado: true, event })
    }

    // Em CHATS_UPDATE o payload pode ser um array ou objeto único
    const chats: unknown[] = Array.isArray(data) ? data : [data]
    console.log(`[webhook] 📦 Total de chats no payload: ${chats.length}`)

    for (const [idx, chat] of chats.entries()) {
      const c = chat as Record<string, unknown>
      console.log(`[webhook] 🔄 Processando chat [${idx + 1}/${chats.length}]:`, JSON.stringify(c, null, 2))

      // JID do contato: "5511999999999@s.whatsapp.net"
      const remoteJid: string =
        (c?.id as string) ?? (c?.remoteJid as string) ?? ''

      if (!remoteJid) {
        console.warn(`[webhook] ⚠️  Chat [${idx + 1}] sem remoteJid/id — ignorando`)
        continue
      }

      const phoneRaw = remoteJid.split('@')[0]
      console.log(`[webhook] 📱 Telefone extraído: ${phoneRaw} (JID: ${remoteJid})`)

      // Nome da instância identifica qual cliente enviou o evento
      const instanceName: string =
        (body?.instance as string) ?? (body?.instanceName as string) ?? ''
      console.log(`[webhook] 🏷️  Instância: "${instanceName}"`)

      const supabase = getServiceClient()

      // ── LOG 2: busca do cliente ───────────────────────────────────────────
      console.log(
        `[webhook] 🔍 Buscando cliente — instância: "${instanceName}" | telefone: "${phoneRaw}"`
      )

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .select('id, pixel_id, capi_token, whatsapp_number, is_active, conversion_label')
        .or(`whatsapp_number.eq.${phoneRaw},whatsapp_number.eq.${instanceName}`)
        .eq('is_active', true)
        .single()

      if (clientError || !client) {
        console.error(
          '[webhook] ❌ Cliente NÃO encontrado para instância/número:',
          { instanceName, phoneRaw, erro: clientError?.message ?? 'sem resultado' }
        )
        continue
      }

      console.log(
        `[webhook] ✅ Cliente encontrado: id="${client.id}" | número="${client.whatsapp_number}" | etiqueta esperada="${client.conversion_label ?? 'Comprou'}"`
      )

      // ── LOG 3: verificação da etiqueta de conversão ───────────────────────
      const labelEsperada = (client.conversion_label ?? 'Comprou').toLowerCase().trim()
      const labels: unknown[] = Array.isArray(c?.labels) ? (c.labels as unknown[]) : []

      const labelsNormalizadas = labels.map((l) =>
        typeof l === 'string'
          ? l
          : typeof (l as Record<string, unknown>)?.name === 'string'
            ? (l as Record<string, unknown>).name
            : JSON.stringify(l)
      )

      console.log(
        `[webhook] 🏷️  Etiquetas recebidas no chat: ${JSON.stringify(labelsNormalizadas)}`
      )
      console.log(
        `[webhook] 🎯 Etiqueta de conversão esperada (case-insensitive): "${labelEsperada}"`
      )

      const temConversao = labels.some(
        (l) =>
          (typeof l === 'string' && l.toLowerCase().trim() === labelEsperada) ||
          (typeof l === 'object' &&
            l !== null &&
            typeof (l as Record<string, unknown>).name === 'string' &&
            ((l as Record<string, unknown>).name as string).toLowerCase().trim() === labelEsperada)
      )

      if (!temConversao) {
        console.log(
          `[webhook] ⏭️  Etiqueta de conversão "${labelEsperada}" NÃO detectada no chat — ignorando`
        )
        continue
      }

      console.log(
        `[webhook] 🎉 Etiqueta de conversão "${labelEsperada}" DETECTADA — iniciando registro de lead`
      )

      // ── LOG 4: hash do telefone e insert do lead ──────────────────────────
      const phoneHashed = hashPhone(phoneRaw)
      console.log(`[webhook] 🔐 Telefone hasheado (SHA-256): ${phoneHashed}`)

      const leadPayload = {
        client_id: client.id,
        phone_raw: phoneRaw,
        phone_hashed: phoneHashed,
        label: client.conversion_label ?? 'Comprou',
        status: 'converted' as const,
        facebook_event_sent: false,
      }

      console.log('[webhook] 💾 Salvando lead no Supabase:', JSON.stringify(leadPayload))

      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .insert(leadPayload)
        .select()
        .single()

      if (leadError || !lead) {
        console.error('[webhook] ❌ Erro ao salvar lead no Supabase:', leadError)
        continue
      }

      console.log(`[webhook] ✅ Lead salvo com sucesso: id="${lead.id}"`)

      // ── LOG 5: disparo do evento CAPI ─────────────────────────────────────
      console.log(
        `[webhook] 📡 Disparando evento Purchase no Facebook CAPI — pixel="${client.pixel_id}"`
      )

      const { success, response: capiResponse } = await sendCapiEvent(
        client.pixel_id,
        client.capi_token,
        phoneHashed
      )

      console.log(
        `[webhook] ${success ? '✅' : '❌'} Resposta do CAPI — sucesso: ${success} | resposta: ${JSON.stringify(capiResponse)}`
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
        `[webhook] 🏁 Lead "${lead.id}" finalizado — CAPI enviado: ${success}`
      )
    }

    console.log('[webhook] ✔️  Processamento concluído')
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[webhook] 💥 Erro interno não tratado:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
