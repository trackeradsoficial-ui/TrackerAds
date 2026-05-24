import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhone, hashName, splitName, sendCapiEvent, type CapiContactData } from '@/lib/capi'

// Instância singleton — criada uma vez no módulo com service role (ignora RLS)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Evolution API envia GET com hub.challenge para verificação do webhook
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (challenge) return new NextResponse(challenge, { status: 200 })
  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/webhooks/whatsapp
//
// Processa dois eventos da Evolution API:
//   • CONTACTS_UPSERT — salva/atualiza nome+telefone na tabela contacts
//   • CHATS_UPDATE    — detecta etiqueta de conversão e dispara evento CAPI
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── Lê e loga o payload bruto antes de qualquer processamento ────────────
  let rawText = ''
  let body: Record<string, unknown> = {}

  try {
    rawText = await req.text()
    console.log('[webhook] ✉️  Payload bruto recebido:\n' + rawText)
  } catch (readErr) {
    console.error('[webhook] 💥 Falha ao ler o corpo da requisição:', readErr)
    return NextResponse.json(
      { error: 'Não foi possível ler o corpo da requisição', detalhe: String(readErr) },
      { status: 400 }
    )
  }

  // ── Parse do JSON ─────────────────────────────────────────────────────────
  try {
    body = JSON.parse(rawText)
  } catch (parseErr) {
    console.error('[webhook] 💥 Payload não é JSON válido:', parseErr)
    return NextResponse.json(
      { error: 'Payload inválido — esperado JSON', detalhe: String(parseErr), payload: rawText.slice(0, 500) },
      { status: 400 }
    )
  }

  // ── Verificação de segredo ────────────────────────────────────────────────
  try {
    const secret = process.env.WEBHOOK_SECRET
    if (secret) {
      const incoming =
        req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')
      if (incoming !== secret) {
        console.warn('[webhook] Requisição rejeitada — segredo inválido')
        return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
      }
    }
  } catch (authErr) {
    console.error('[webhook] 💥 Erro na verificação de segredo:', authErr)
    return NextResponse.json(
      { error: 'Erro na verificação de segredo', detalhe: String(authErr) },
      { status: 500 }
    )
  }

  // ── Roteamento do evento ──────────────────────────────────────────────────
  try {
    const event: string = (body?.event as string) ?? (body?.type as string) ?? ''
    const data = body?.data ?? body

    console.log(`[webhook] 📌 Evento detectado: "${event}"`)
    console.log('[webhook] 📦 Body parseado:', JSON.stringify(body, null, 2))

    if (event === 'CONTACTS_UPSERT' || event === 'contacts.upsert') {
      return await handleContactsUpsert(body, data)
    }

    if (event === 'CHATS_UPDATE' || event === 'chats.update') {
      return await handleChatsUpdate(body, data)
    }

    console.log(`[webhook] ⏭️  Evento ignorado: "${event}"`)
    return NextResponse.json({ ok: true, ignorado: true, event })

  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    const stack    = err instanceof Error ? err.stack   : undefined

    console.error('[webhook] 💥 Erro interno no roteamento:', err)
    console.error('[webhook] Stack:', stack)

    return NextResponse.json(
      {
        error:   'Erro interno do servidor',
        detalhe: mensagem,
        stack:   stack ?? null,
        evento:  (body?.event as string) ?? (body?.type as string) ?? '(desconhecido)',
      },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca o cliente com estratégia em 2 etapas:
//
//   1. Por whatsapp_number (número do owner da instância) — mais confiável.
//      O número pode estar gravado no banco em qualquer um desses formatos:
//        • 5519982250102   (com DDI 55)
//        • 19982250102     (sem DDI)
//        • 9982250102      (sem DDI e sem o 9 extra — raro)
//      Por isso usamos LIKE com o sufixo mínimo do número para cobrir todos.
//
//   2. Fallback por whatsapp_instance = instanceId (nome/ID da instância).
//
// ownerJid: ex. "5519982250102@s.whatsapp.net" — extraímos só os dígitos.
// ─────────────────────────────────────────────────────────────────────────────
async function findClient(
  instanceId: string,
  ownerJid: string
) {
  // Normaliza o número do owner: remove sufixo @* e não-dígitos
  const ownerPhone = ownerJid.split('@')[0].replace(/\D/g, '')

  console.log(
    `[webhook] 🔍 Iniciando busca de cliente — instance="${instanceId}" | ownerJid="${ownerJid}" | ownerPhone="${ownerPhone}"`
  )

  // ── Etapa 1: busca flexível por whatsapp_number ───────────────────────────
  // Monta lista de sufixos em ordem decrescente de especificidade.
  // Ex.: ownerPhone = "5519982250102"
  //   → suffixes = ["5519982250102", "19982250102", "1982250102"]
  if (ownerPhone.length >= 8) {
    const suffixes: string[] = [ownerPhone]

    // Remove DDI 55 se o número tiver 13 dígitos (55 + DDD + 9 dígitos)
    if (ownerPhone.startsWith('55') && ownerPhone.length === 13) {
      const semDDI = ownerPhone.slice(2)        // "19982250102"
      suffixes.push(semDDI)
      // Remove também o nono dígito caso o banco tenha número antigo de 10 dígitos
      if (semDDI.length === 11) {
        suffixes.push(semDDI.slice(0, 2) + semDDI.slice(3)) // "1982250102"
      }
    }

    for (const suffix of suffixes) {
      console.log(
        `[webhook] 🔎 Tentando whatsapp_number LIKE "%${suffix}"`
      )

      const { data: client, error } = await supabase
        .from('clients')
        .select('id, pixel_id, capi_token, whatsapp_number, whatsapp_instance, is_active, conversion_label')
        .like('whatsapp_number', `%${suffix}`)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error(
          `[webhook] ⚠️  Erro ao buscar por whatsapp_number LIKE "%${suffix}":`,
          error.message
        )
        continue
      }

      if (client) {
        console.log(
          `[webhook] ✅ Cliente encontrado via whatsapp_number (sufixo="${suffix}"): id="${client.id}" | número no banco="${client.whatsapp_number}"`
        )

        // Registra o instanceId automaticamente se ainda não estava salvo
        if (instanceId && !client.whatsapp_instance) {
          const { error: updateErr } = await supabase
            .from('clients')
            .update({ whatsapp_instance: instanceId })
            .eq('id', client.id)

          if (updateErr) {
            console.warn(
              `[webhook] ⚠️  Falha ao salvar whatsapp_instance para "${client.id}":`,
              updateErr.message
            )
          } else {
            console.log(
              `[webhook] 💾 whatsapp_instance="${instanceId}" salvo automaticamente para cliente "${client.id}"`
            )
          }
        }

        return client
      }

      console.log(
        `[webhook] ℹ️  Nenhum cliente com whatsapp_number LIKE "%${suffix}"`
      )
    }
  } else {
    console.warn(
      `[webhook] ⚠️  ownerPhone muito curto ou ausente ("${ownerPhone}") — pulando busca por número`
    )
  }

  // ── Etapa 2: fallback por whatsapp_instance ───────────────────────────────
  if (instanceId) {
    console.log(
      `[webhook] 🔎 Tentando fallback por whatsapp_instance="${instanceId}"`
    )

    const { data: client, error } = await supabase
      .from('clients')
      .select('id, pixel_id, capi_token, whatsapp_number, whatsapp_instance, is_active, conversion_label')
      .eq('whatsapp_instance', instanceId)
      .eq('is_active', true)
      .maybeSingle()

    if (!error && client) {
      console.log(
        `[webhook] ✅ Cliente encontrado via whatsapp_instance="${instanceId}": id="${client.id}"`
      )
      return client
    }

    console.log(
      `[webhook] ℹ️  Nenhum cliente com whatsapp_instance="${instanceId}"`
    )
  }

  console.error(
    `[webhook] ❌ Cliente NÃO encontrado após todas as tentativas — instance="${instanceId}" | ownerPhone="${ownerPhone}"`
  )
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACTS_UPSERT
// Payload: { event: "CONTACTS_UPSERT", instance: "<id>", data: [...contacts] }
// Cada contato: { id: "5511...@s.whatsapp.net", pushName: "Nome", owner: "...@s.whatsapp.net" }
// ─────────────────────────────────────────────────────────────────────────────
async function handleContactsUpsert(
  body: Record<string, unknown>,
  data: unknown
): Promise<NextResponse> {
  try {
    const instanceId: string =
      (body?.instance as string) ?? (body?.instanceName as string) ?? ''

    // owner pode estar no primeiro item do array ou no body
    const items: unknown[] = Array.isArray(data) ? data : (data != null ? [data] : [])
    const firstItem = items[0] as Record<string, unknown> | undefined
    const ownerJid: string =
      (body?.sender as string) ??
      (firstItem?.owner as string) ??
      ''

    console.log(
      `[webhook/contacts] 👥 CONTACTS_UPSERT — instance="${instanceId}" | owner="${ownerJid}" | ${items.length} contato(s)`
    )

    const client = await findClient(instanceId, ownerJid)

    if (!client) {
      console.warn('[webhook/contacts] ⚠️  Cliente não identificado — ignorando')
      return NextResponse.json({ ok: true, ignorado: true })
    }

    let salvos = 0
    let erros  = 0

    for (const item of items) {
      try {
        const c = item as Record<string, unknown>

        const jid: string = (c?.id as string) ?? (c?.remoteJid as string) ?? ''

        // Ignora grupos e broadcasts
        if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) continue

        const phone = jid.split('@')[0].replace(/\D/g, '')
        if (!phone) continue

        const name: string =
          (c?.pushName       as string) ??
          (c?.name           as string) ??
          (c?.verifiedName   as string) ??
          ''

        console.log(
          `[webhook/contacts] 💾 Upsert: phone="${phone}" name="${name}"`
        )

        const { error } = await supabase
          .from('contacts')
          .upsert(
            { client_id: client.id, phone, name: name || null },
            { onConflict: 'client_id,phone', ignoreDuplicates: false }
          )

        if (error) {
          console.error(`[webhook/contacts] ❌ Erro "${phone}":`, error.message)
          erros++
        } else {
          salvos++
        }
      } catch (itemErr) {
        console.error('[webhook/contacts] ❌ Exceção ao processar contato:', itemErr)
        erros++
      }
    }

    console.log(`[webhook/contacts] ✅ salvos=${salvos} erros=${erros}`)
    return NextResponse.json({ ok: true, salvos, erros })

  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    console.error('[webhook/contacts] 💥 Erro inesperado em handleContactsUpsert:', err)
    return NextResponse.json(
      { error: 'Erro ao processar CONTACTS_UPSERT', detalhe: mensagem },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CHATS_UPDATE
// Payload: { event: "CHATS_UPDATE", instance: "<id>", data: [...chats] }
// Cada chat: { id: "5511...@s.whatsapp.net", owner: "5519...@s.whatsapp.net", labels: [...] }
// ─────────────────────────────────────────────────────────────────────────────
async function handleChatsUpdate(
  body: Record<string, unknown>,
  data: unknown
): Promise<NextResponse> {
  try {
    const instanceId: string =
      (body?.instance as string) ?? (body?.instanceName as string) ?? ''

    // Garante que data é sempre um array, independente do que vier no payload
    const chats: unknown[] = Array.isArray(data)
      ? data
      : (data != null ? [data] : [])

    console.log(
      `[webhook/chats] 🔄 CHATS_UPDATE — instance="${instanceId}" | ${chats.length} chat(s)`
    )

    if (chats.length === 0) {
      console.warn('[webhook/chats] ⚠️  Nenhum chat no payload — ignorando')
      return NextResponse.json({ ok: true, ignorado: true, motivo: 'sem chats no payload' })
    }

    const resultados: Array<{ chat: string; resultado: string }> = []

    for (const [idx, chat] of chats.entries()) {
      try {
        const c = chat as Record<string, unknown>

        console.log(
          `[webhook/chats] 📋 Processando chat [${idx + 1}/${chats.length}]:`,
          JSON.stringify(c, null, 2)
        )

        // JID do contato que será convertido
        const remoteJid: string =
          (c?.id as string) ?? (c?.remoteJid as string) ?? ''

        if (!remoteJid || remoteJid.includes('@g.us')) {
          console.warn(`[webhook/chats] ⚠️  Chat [${idx + 1}] sem JID válido ("${remoteJid}") — ignorando`)
          resultados.push({ chat: remoteJid || `[${idx + 1}]`, resultado: 'ignorado — sem JID válido' })
          continue
        }

        // owner: tenta no item do chat primeiro, depois no body (sender), depois no instanceId
        const ownerJid: string =
          (c?.owner  as string) ??
          (body?.sender as string) ??
          ''

        const phoneRaw = remoteJid.split('@')[0]
        console.log(
          `[webhook/chats] 📱 remoteJid="${remoteJid}" | phoneRaw="${phoneRaw}" | ownerJid="${ownerJid}"`
        )

        const client = await findClient(instanceId, ownerJid)

        if (!client) {
          console.warn(`[webhook/chats] ⚠️  Chat [${idx + 1}] — cliente não identificado — ignorando`)
          resultados.push({ chat: remoteJid, resultado: 'ignorado — cliente não encontrado' })
          continue
        }

        console.log(
          `[webhook/chats] 🎯 Etiqueta esperada: "${client.conversion_label ?? 'Comprou'}"`
        )

        // ── Verifica etiqueta de conversão ──────────────────────────────────
        const labelEsperada = (client.conversion_label ?? 'Comprou').toLowerCase().trim()

        // labels pode ser array de strings ou array de objetos { name: string }
        const labelsRaw: unknown[] = Array.isArray(c?.labels)
          ? (c.labels as unknown[])
          : []

        const labelsNormalizadas: string[] = labelsRaw.map((l) => {
          if (typeof l === 'string') return l
          if (l !== null && typeof l === 'object') {
            const obj = l as Record<string, unknown>
            if (typeof obj.name === 'string') return obj.name
          }
          return JSON.stringify(l)
        })

        console.log(
          `[webhook/chats] 🏷️  Etiquetas recebidas: ${JSON.stringify(labelsNormalizadas)} | Esperada: "${labelEsperada}"`
        )

        const temConversao = labelsNormalizadas.some(
          (label) => label.toLowerCase().trim() === labelEsperada
        )

        if (!temConversao) {
          console.log(
            `[webhook/chats] ⏭️  Etiqueta "${labelEsperada}" não detectada em [${labelsNormalizadas.join(', ')}] — ignorando`
          )
          resultados.push({ chat: remoteJid, resultado: `ignorado — etiqueta "${labelEsperada}" não presente` })
          continue
        }

        console.log(`[webhook/chats] 🎉 Etiqueta "${labelEsperada}" DETECTADA!`)

        // ── Busca nome do contato ───────────────────────────────────────────
        const phoneNormalizado = phoneRaw.replace(/\D/g, '')

        const { data: contactRow } = await supabase
          .from('contacts')
          .select('name')
          .eq('client_id', client.id)
          .eq('phone', phoneNormalizado)
          .maybeSingle()

        const nomeCompleto: string = contactRow?.name ?? ''
        console.log(
          `[webhook/chats] 👤 Nome do contato: "${nomeCompleto || '(não encontrado)'}"`
        )

        // ── Monta dados para o CAPI ─────────────────────────────────────────
        const phoneHashed = hashPhone(phoneRaw)
        const capiContact: CapiContactData = { phoneHashed }

        if (nomeCompleto) {
          const { firstName, lastName } = splitName(nomeCompleto)
          if (firstName) {
            capiContact.firstNameHashed = hashName(firstName)
            console.log(`[webhook/chats] 🔐 fn="${firstName}" → ${capiContact.firstNameHashed}`)
          }
          if (lastName) {
            capiContact.lastNameHashed = hashName(lastName)
            console.log(`[webhook/chats] 🔐 ln="${lastName}" → ${capiContact.lastNameHashed}`)
          }
        }

        // ── Salva lead ──────────────────────────────────────────────────────
        const { data: lead, error: leadError } = await supabase
          .from('leads')
          .insert({
            client_id:           client.id,
            phone_raw:           phoneRaw,
            phone_hashed:        phoneHashed,
            label:               client.conversion_label ?? 'Comprou',
            status:              'converted' as const,
            facebook_event_sent: false,
          })
          .select()
          .single()

        if (leadError || !lead) {
          console.error('[webhook/chats] ❌ Erro ao salvar lead:', leadError?.message ?? 'retorno nulo')
          resultados.push({ chat: remoteJid, resultado: `erro ao salvar lead: ${leadError?.message ?? 'retorno nulo'}` })
          continue
        }

        console.log(`[webhook/chats] ✅ Lead salvo: id="${lead.id}"`)

        // ── Dispara evento Purchase no Facebook CAPI ────────────────────────
        console.log(
          `[webhook/chats] 📡 Disparando CAPI — pixel="${client.pixel_id}"` +
          (capiContact.firstNameHashed ? ' +fn' : '') +
          (capiContact.lastNameHashed  ? ' +ln' : '')
        )

        const { success, response: capiResponse } = await sendCapiEvent(
          client.pixel_id,
          client.capi_token,
          phoneHashed,
          undefined,
          capiContact
        )

        console.log(
          `[webhook/chats] ${success ? '✅' : '❌'} CAPI: sucesso=${success} | ${JSON.stringify(capiResponse)}`
        )

        await supabase
          .from('leads')
          .update({ facebook_event_sent: success, facebook_event_response: capiResponse })
          .eq('id', lead.id)

        console.log(`[webhook/chats] 🏁 Lead "${lead.id}" finalizado`)
        resultados.push({ chat: remoteJid, resultado: `lead=${lead.id} | capi=${success ? 'enviado' : 'falhou'}` })

      } catch (chatErr) {
        const mensagem = chatErr instanceof Error ? chatErr.message : String(chatErr)
        console.error(`[webhook/chats] 💥 Exceção no chat [${idx + 1}]:`, chatErr)
        resultados.push({ chat: `[${idx + 1}]`, resultado: `exceção: ${mensagem}` })
        // continua processando os próximos chats
      }
    }

    console.log('[webhook/chats] 📊 Resumo:', JSON.stringify(resultados))
    return NextResponse.json({ ok: true, resultados })

  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err)
    const stack    = err instanceof Error ? err.stack   : undefined
    console.error('[webhook/chats] 💥 Erro inesperado em handleChatsUpdate:', err)
    return NextResponse.json(
      { error: 'Erro ao processar CHATS_UPDATE', detalhe: mensagem, stack: stack ?? null },
      { status: 500 }
    )
  }
}
