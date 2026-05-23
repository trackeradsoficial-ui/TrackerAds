import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhone, hashName, splitName, sendCapiEvent, type CapiContactData } from '@/lib/capi'

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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/whatsapp
//
// Processa dois tipos de evento da Evolution API:
//   • CONTACTS_UPSERT — salva/atualiza nome+telefone na tabela contacts
//   • CHATS_UPDATE    — detecta etiqueta de conversão e dispara evento CAPI
// ─────────────────────────────────────────────────────────────────────────────
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

    console.log('[webhook] ✉️  Payload recebido:', JSON.stringify(body, null, 2))

    const event: string = body?.event ?? body?.type ?? ''
    const data = body?.data ?? body

    console.log(`[webhook] 📌 Evento identificado: "${event}"`)

    // ── CONTACTS_UPSERT ───────────────────────────────────────────────────────
    if (event === 'CONTACTS_UPSERT' || event === 'contacts.upsert') {
      return await handleContactsUpsert(body, data)
    }

    // ── CHATS_UPDATE ──────────────────────────────────────────────────────────
    if (event === 'CHATS_UPDATE' || event === 'chats.update') {
      return await handleChatsUpdate(body, data)
    }

    console.log(`[webhook] ⏭️  Evento ignorado: "${event}"`)
    return NextResponse.json({ ok: true, ignorado: true, event })

  } catch (err) {
    console.error('[webhook] 💥 Erro interno não tratado:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS_UPSERT
// Payload da Evolution API (v1.8+):
//   { event: "CONTACTS_UPSERT", instance: "<numero>", data: [...contacts] }
//   Cada contato: { id: "5511999@s.whatsapp.net", pushName: "João Silva", ... }
// ─────────────────────────────────────────────────────────────────────────────
async function handleContactsUpsert(
  body: Record<string, unknown>,
  data: unknown
): Promise<NextResponse> {
  const instanceName: string =
    (body?.instance as string) ?? (body?.instanceName as string) ?? ''

  console.log(`[webhook/contacts] 👤 CONTACTS_UPSERT — instância: "${instanceName}"`)

  const supabase = getServiceClient()

  // Localiza o cliente pela instância / número de WhatsApp
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id, whatsapp_number')
    .or(`whatsapp_number.eq.${instanceName},whatsapp_number.eq.${instanceName}`)
    .eq('is_active', true)
    .single()

  if (clientError || !client) {
    console.warn(
      `[webhook/contacts] ⚠️  Cliente não encontrado para instância "${instanceName}" — ignorando`
    )
    return NextResponse.json({ ok: true, ignorado: true })
  }

  const contacts: unknown[] = Array.isArray(data) ? data : [data]
  console.log(`[webhook/contacts] 📦 ${contacts.length} contato(s) para processar`)

  let salvos = 0
  let erros  = 0

  for (const item of contacts) {
    const c = item as Record<string, unknown>

    // JID → telefone
    const jid: string = (c?.id as string) ?? (c?.remoteJid as string) ?? ''
    if (!jid || jid.includes('@g.us')) {
      // ignora grupos
      continue
    }

    const phone = jid.split('@')[0].replace(/\D/g, '')
    if (!phone) continue

    // Nome do contato (pushName ou name)
    const name: string =
      (c?.pushName as string) ??
      (c?.name    as string) ??
      (c?.verifiedName as string) ??
      ''

    console.log(
      `[webhook/contacts] 💾 Upsert: phone="${phone}" name="${name}" client="${client.id}"`
    )

    const { error } = await supabase
      .from('contacts')
      .upsert(
        {
          client_id: client.id,
          phone,
          name: name || null,
        },
        {
          onConflict:        'client_id,phone',
          ignoreDuplicates:  false, // atualiza o nome se mudar
        }
      )

    if (error) {
      console.error(`[webhook/contacts] ❌ Erro ao salvar contato "${phone}":`, error.message)
      erros++
    } else {
      salvos++
    }
  }

  console.log(`[webhook/contacts] ✅ Concluído — salvos: ${salvos} | erros: ${erros}`)
  return NextResponse.json({ ok: true, salvos, erros })
}

// ─────────────────────────────────────────────────────────────────────────────
// CHATS_UPDATE
// Detecta etiqueta de conversão → busca nome do contato → dispara CAPI
// ─────────────────────────────────────────────────────────────────────────────
async function handleChatsUpdate(
  body: Record<string, unknown>,
  data: unknown
): Promise<NextResponse> {
  const chats: unknown[] = Array.isArray(data) ? data : [data]
  const instanceName: string =
    (body?.instance as string) ?? (body?.instanceName as string) ?? ''

  console.log(
    `[webhook/chats] 🔄 CHATS_UPDATE — instância: "${instanceName}" | ${chats.length} chat(s)`
  )

  for (const [idx, chat] of chats.entries()) {
    const c = chat as Record<string, unknown>
    console.log(
      `[webhook/chats] 📋 Chat [${idx + 1}/${chats.length}]:`,
      JSON.stringify(c, null, 2)
    )

    // JID do contato
    const remoteJid: string =
      (c?.id as string) ?? (c?.remoteJid as string) ?? ''

    if (!remoteJid) {
      console.warn(`[webhook/chats] ⚠️  Chat [${idx + 1}] sem remoteJid — ignorando`)
      continue
    }

    const phoneRaw = remoteJid.split('@')[0]
    console.log(`[webhook/chats] 📱 Telefone: "${phoneRaw}" (JID: ${remoteJid})`)

    const supabase = getServiceClient()

    // Localiza o cliente
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, pixel_id, capi_token, whatsapp_number, is_active, conversion_label')
      .or(`whatsapp_number.eq.${phoneRaw},whatsapp_number.eq.${instanceName}`)
      .eq('is_active', true)
      .single()

    if (clientError || !client) {
      console.error(
        '[webhook/chats] ❌ Cliente não encontrado:',
        { instanceName, phoneRaw, erro: clientError?.message ?? 'sem resultado' }
      )
      continue
    }

    console.log(
      `[webhook/chats] ✅ Cliente: id="${client.id}" | etiqueta="${client.conversion_label ?? 'Comprou'}"`
    )

    // Verifica etiqueta de conversão
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
      `[webhook/chats] 🏷️  Etiquetas recebidas: ${JSON.stringify(labelsNormalizadas)}`
    )
    console.log(
      `[webhook/chats] 🎯 Etiqueta esperada (case-insensitive): "${labelEsperada}"`
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
        `[webhook/chats] ⏭️  Etiqueta "${labelEsperada}" não detectada — ignorando`
      )
      continue
    }

    console.log(
      `[webhook/chats] 🎉 Etiqueta "${labelEsperada}" DETECTADA — processando conversão`
    )

    // ── Busca nome do contato na tabela contacts ──────────────────────────────
    const phoneNormalizado = phoneRaw.replace(/\D/g, '')

    const { data: contactRow } = await supabase
      .from('contacts')
      .select('name')
      .eq('client_id', client.id)
      .eq('phone', phoneNormalizado)
      .maybeSingle()

    const nomeCompleto: string = contactRow?.name ?? ''
    console.log(
      `[webhook/chats] 👤 Nome do contato encontrado: "${nomeCompleto || '(não encontrado)'}"`
    )

    // ── Monta dados para o CAPI ───────────────────────────────────────────────
    const phoneHashed = hashPhone(phoneRaw)

    const capiContact: CapiContactData = { phoneHashed }

    if (nomeCompleto) {
      const { firstName, lastName } = splitName(nomeCompleto)

      if (firstName) {
        capiContact.firstNameHashed = hashName(firstName)
        console.log(
          `[webhook/chats] 🔐 fn hasheado (primeiro nome "${firstName}"): ${capiContact.firstNameHashed}`
        )
      }
      if (lastName) {
        capiContact.lastNameHashed = hashName(lastName)
        console.log(
          `[webhook/chats] 🔐 ln hasheado (último nome "${lastName}"): ${capiContact.lastNameHashed}`
        )
      }
    }

    console.log(`[webhook/chats] 🔐 ph hasheado: ${phoneHashed}`)

    // ── Salva lead ────────────────────────────────────────────────────────────
    const leadPayload = {
      client_id:            client.id,
      phone_raw:            phoneRaw,
      phone_hashed:         phoneHashed,
      label:                client.conversion_label ?? 'Comprou',
      status:               'converted' as const,
      facebook_event_sent:  false,
    }

    console.log('[webhook/chats] 💾 Salvando lead:', JSON.stringify(leadPayload))

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(leadPayload)
      .select()
      .single()

    if (leadError || !lead) {
      console.error('[webhook/chats] ❌ Erro ao salvar lead:', leadError)
      continue
    }

    console.log(`[webhook/chats] ✅ Lead salvo: id="${lead.id}"`)

    // ── Dispara evento CAPI ───────────────────────────────────────────────────
    console.log(
      `[webhook/chats] 📡 Disparando Purchase no CAPI — pixel="${client.pixel_id}"` +
      (capiContact.firstNameHashed ? ' | com fn' : '') +
      (capiContact.lastNameHashed  ? ' | com ln' : '')
    )

    const { success, response: capiResponse } = await sendCapiEvent(
      client.pixel_id,
      client.capi_token,
      phoneHashed,
      undefined,  // testEventCode
      capiContact
    )

    console.log(
      `[webhook/chats] ${success ? '✅' : '❌'} CAPI — sucesso: ${success} | resposta: ${JSON.stringify(capiResponse)}`
    )

    // Atualiza lead com resultado
    await supabase
      .from('leads')
      .update({
        facebook_event_sent:     success,
        facebook_event_response: capiResponse,
      })
      .eq('id', lead.id)

    console.log(
      `[webhook/chats] 🏁 Lead "${lead.id}" finalizado — CAPI enviado: ${success}`
    )
  }

  console.log('[webhook/chats] ✔️  Processamento concluído')
  return NextResponse.json({ ok: true })
}
