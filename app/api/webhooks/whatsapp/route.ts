// Força avaliação em runtime — impede que o Next.js instancie o módulo
// durante o build, quando as variáveis de ambiente ainda não existem.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// Cliente Supabase com service role (ignora RLS)
// ─────────────────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─────────────────────────────────────────────────────────────────────────────
// Utilitários
// ─────────────────────────────────────────────────────────────────────────────

/** SHA-256 de uma string — retorna hex. */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

/** Normaliza e hasheia um telefone: remove não-dígitos, aplica SHA-256. */
function hashPhone(phone: string): string {
  return sha256(phone.replace(/\D/g, ''))
}

/** Normaliza e hasheia um nome para o Facebook CAPI (lowercase, sem espaços extras). */
function hashName(name: string): string {
  return sha256(name.trim().toLowerCase())
}

/** Extrai primeiro e último nome de um nome completo. */
function splitName(fullName: string): { firstName?: string; lastName?: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return {}
  return {
    firstName: parts[0],
    lastName:  parts.length > 1 ? parts[parts.length - 1] : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Envio do evento Purchase para o Facebook CAPI
// ─────────────────────────────────────────────────────────────────────────────
async function sendCapiEvent(opts: {
  pixelId:     string
  capiToken:   string
  phoneHashed: string
  fnHashed?:   string
  lnHashed?:   string
}): Promise<{ sucesso: boolean; resposta: Record<string, unknown> }> {
  const { pixelId, capiToken, phoneHashed, fnHashed, lnHashed } = opts

  const evento = {
    event_name:    'Purchase',
    event_time:    Math.floor(Date.now() / 1000),
    action_source: 'other',
    user_data: {
      ph: [phoneHashed],
      ...(fnHashed ? { fn: [fnHashed] } : {}),
      ...(lnHashed ? { ln: [lnHashed] } : {}),
    },
    custom_data: { currency: 'BRL', value: 1 },
  }

  const url =
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${capiToken}`

  try {
    const res  = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ data: [evento] }),
    })
    const json = (await res.json()) as Record<string, unknown>
    return { sucesso: res.ok, resposta: json }
  } catch (err) {
    return { sucesso: false, resposta: { erro: String(err) } }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Busca o cliente pelo ownerPhone (ILIKE com candidatos) + fallback por
// whatsapp_instance. Retorna null se não encontrar.
// ─────────────────────────────────────────────────────────────────────────────
async function buscarCliente(
  ownerPhone: string,
  instanceId: string
): Promise<{ cliente: Record<string, unknown>; metodo: string } | null> {
  // Candidatos em ordem: com DDI, sem DDI, sem DDI e sem nono dígito
  // Só tenta a busca por número se ownerPhone tiver pelo menos 8 dígitos —
  // evita ILIKE '%' que retornaria qualquer cliente ativo
  const candidatos: string[] = ownerPhone.length >= 8 ? [ownerPhone] : []
  if (ownerPhone.startsWith('55') && ownerPhone.length === 13) {
    const semDDI = ownerPhone.slice(2)                            // "19982250102"
    candidatos.push(semDDI)
    if (semDDI.length === 11) {
      candidatos.push(semDDI.slice(0, 2) + semDDI.slice(3))      // "1982250102"
    }
  }

  for (const candidato of candidatos) {
    console.log(`[webhook] 🔎 Buscando cliente com whatsapp_number ILIKE "%${candidato}"`)

    const { data, error } = await supabase
      .from('clients')
      .select('id, pixel_id, capi_token, whatsapp_number, whatsapp_instance, conversion_label, conversion_label_id')
      .ilike('whatsapp_number', `%${candidato}`)
      .eq('is_active', true)
      .maybeSingle()

    if (error) {
      console.error(`[webhook] ⚠️  Erro na busca por "%${candidato}":`, error.message)
      continue
    }
    if (data) {
      return { cliente: data as Record<string, unknown>, metodo: `whatsapp_number ILIKE "%${candidato}"` }
    }
  }

  // Fallback: por whatsapp_instance
  if (instanceId) {
    console.log(`[webhook] 🔎 Fallback: buscando cliente com whatsapp_instance="${instanceId}"`)

    const { data, error } = await supabase
      .from('clients')
      .select('id, pixel_id, capi_token, whatsapp_number, whatsapp_instance, conversion_label, conversion_label_id')
      .eq('whatsapp_instance', instanceId)
      .eq('is_active', true)
      .maybeSingle()

    if (!error && data) {
      return { cliente: data as Record<string, unknown>, metodo: `whatsapp_instance="${instanceId}"` }
    }
  }

  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Núcleo de conversão — compartilhado por chats.update e labels.association.
//
// Recebe:
//   cliente   — linha da tabela clients
//   labelName — nome da etiqueta que chegou no payload (já como string)
//   contactId — JID do contato convertido (ex: "5511...@s.whatsapp.net")
//   origem    — string de log para identificar de qual evento veio
// ─────────────────────────────────────────────────────────────────────────────
async function processarConversao(
  cliente:   Record<string, unknown>,
  labelName: string,
  contactId: string,
  origem:    string
): Promise<void> {
  const labelEsperada = String(cliente.conversion_label ?? 'Comprou').toLowerCase().trim()
  const labelRecebida = labelName.toLowerCase().trim()

  console.log(
    `[webhook/${origem}] 🎯 Etiqueta esperada: "${labelEsperada}" | recebida: "${labelRecebida}"`
  )

  if (labelRecebida !== labelEsperada) {
    console.log(
      `[webhook/${origem}] ⏭️  Etiqueta "${labelRecebida}" não é a de conversão — ignorando`
    )
    return
  }

  console.log(`[webhook/${origem}] 🎉 Etiqueta "${labelEsperada}" DETECTADA!`)

  // ── Extrai telefone do JID do contato ─────────────────────────────────────
  const phoneRaw = contactId.split('@')[0]

  console.log(`[webhook/${origem}] 📱 contactId="${contactId}" → phoneRaw="${phoneRaw}"`)

  if (!phoneRaw || phoneRaw.length < 5) {
    console.warn(`[webhook/${origem}] ⚠️  Telefone inválido ("${phoneRaw}") — ignorando`)
    return
  }

  // ── Hasheia o telefone ────────────────────────────────────────────────────
  const phoneHashed = hashPhone(phoneRaw)
  console.log(
    `[webhook/${origem}] 🔐 phoneRaw="${phoneRaw}" → phoneHashed="${phoneHashed.slice(0, 16)}..."`
  )

  // ── Busca nome do contato para enriquecer o CAPI ──────────────────────────
  const phoneNormalizado = phoneRaw.replace(/\D/g, '')
  const { data: contatoRow } = await supabase
    .from('contacts')
    .select('name')
    .eq('client_id', cliente.id)
    .eq('phone', phoneNormalizado)
    .maybeSingle()

  const nomeCompleto = String((contatoRow as Record<string, unknown> | null)?.name ?? '')
  console.log(
    `[webhook/${origem}] 👤 Nome do contato: "${nomeCompleto || '(não encontrado)'}"`
  )

  let fnHashed: string | undefined
  let lnHashed: string | undefined

  if (nomeCompleto) {
    const { firstName, lastName } = splitName(nomeCompleto)
    if (firstName) {
      fnHashed = hashName(firstName)
      console.log(`[webhook/${origem}] 🔐 fn="${firstName}" → ${fnHashed.slice(0, 16)}...`)
    }
    if (lastName) {
      lnHashed = hashName(lastName)
      console.log(`[webhook/${origem}] 🔐 ln="${lastName}" → ${lnHashed.slice(0, 16)}...`)
    }
  }

  // ── Insere lead ───────────────────────────────────────────────────────────
  const { data: leadInserido, error: erroLead } = await supabase
    .from('leads')
    .insert({
      client_id:           cliente.id,
      phone_raw:           phoneRaw,
      phone_hashed:        phoneHashed,
      label:               cliente.conversion_label ?? 'Comprou',
      status:              'converted',
      facebook_event_sent: false,
    })
    .select('id')
    .single()

  if (erroLead || !leadInserido) {
    console.error(
      `[webhook/${origem}] ❌ Erro ao inserir lead:`,
      erroLead?.message ?? 'retorno nulo'
    )
    return
  }

  const leadId = String((leadInserido as Record<string, unknown>).id)
  console.log(`[webhook/${origem}] ✅ Lead inserido: id="${leadId}"`)

  // ── Dispara evento Purchase no Facebook CAPI ──────────────────────────────
  console.log(
    `[webhook/${origem}] 📡 Disparando CAPI — pixel="${cliente.pixel_id}"` +
    (fnHashed ? ' +fn' : '') +
    (lnHashed ? ' +ln' : '')
  )

  const { sucesso, resposta } = await sendCapiEvent({
    pixelId:   String(cliente.pixel_id),
    capiToken: String(cliente.capi_token),
    phoneHashed,
    fnHashed,
    lnHashed,
  })

  console.log(
    `[webhook/${origem}] ${sucesso ? '✅' : '❌'} CAPI: sucesso=${sucesso} | ${JSON.stringify(resposta)}`
  )

  // ── Atualiza lead com resultado do CAPI ───────────────────────────────────
  const { error: erroUpdate } = await supabase
    .from('leads')
    .update({
      facebook_event_sent:     sucesso,
      facebook_event_response: resposta,
    })
    .eq('id', leadId)

  if (erroUpdate) {
    console.error(
      `[webhook/${origem}] ⚠️  Falha ao atualizar lead "${leadId}":`, erroUpdate.message
    )
  } else {
    console.log(`[webhook/${origem}] 🏁 Lead "${leadId}" finalizado`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — responde ao challenge de verificação da Evolution API
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (challenge) return new NextResponse(challenge, { status: 200 })
  return NextResponse.json({ ok: true })
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — processa eventos da Evolution API
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // ── 1. Leitura e log do payload ───────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    const texto = await req.text()
    console.log('[webhook] ✉️  Payload recebido:\n' + texto)
    body = JSON.parse(texto) as Record<string, unknown>
  } catch (err) {
    console.error('[webhook] ❌ Falha ao parsear o payload:', err)
    return NextResponse.json(
      { erro: 'Payload inválido — esperado JSON', detalhe: String(err) },
      { status: 400 }
    )
  }

  console.log('[webhook] 📦 Body completo:', JSON.stringify(body, null, 2))

  const event      = String(body?.event ?? body?.type ?? '')
  const instanceId = String(body?.instance ?? body?.instanceName ?? '')
  console.log(`[webhook] 📌 Evento: "${event}" | instance: "${instanceId}"`)

  // ── 2. Roteamento por tipo de evento ──────────────────────────────────────

  // ── chats.update ─────────────────────────────────────────────────────────
  if (event === 'CHATS_UPDATE' || event === 'chats.update') {
    const rawData = body?.data
    const chats: Record<string, unknown>[] = Array.isArray(rawData)
      ? rawData as Record<string, unknown>[]
      : rawData != null
        ? [rawData as Record<string, unknown>]
        : []

    console.log(`[webhook] 🔄 chats.update — ${chats.length} chat(s)`)

    for (const [idx, chat] of chats.entries()) {
      console.log(
        `[webhook] 📋 Chat [${idx + 1}/${chats.length}]:`,
        JSON.stringify(chat, null, 2)
      )

      // Extrai ownerPhone
      const ownerRaw   = String(chat?.owner ?? body?.sender ?? '')
      const ownerPhone = ownerRaw.split('@')[0].replace(/\D/g, '')
      console.log(`[webhook] 👤 ownerRaw="${ownerRaw}" → ownerPhone="${ownerPhone}"`)

      if (!ownerPhone || ownerPhone.length < 8) {
        console.warn(`[webhook] ⚠️  Chat [${idx + 1}] — ownerPhone inválido — ignorando`)
        continue
      }

      // Extrai labels (array de strings ou objetos { name })
      const labelsRaw: unknown[] = Array.isArray(chat?.labels)
        ? chat.labels as unknown[]
        : []

      const labels: string[] = labelsRaw.map((l) => {
        if (typeof l === 'string') return l
        if (l !== null && typeof l === 'object') {
          const obj = l as Record<string, unknown>
          if (typeof obj.name === 'string') return obj.name
        }
        return ''
      }).filter(Boolean)

      console.log(`[webhook] 🏷️  Etiquetas: ${JSON.stringify(labels)}`)

      // Busca cliente
      const resultado = await buscarCliente(ownerPhone, instanceId)
      if (!resultado) {
        console.error(
          `[webhook] ❌ Chat [${idx + 1}] — nenhum cliente encontrado para ownerPhone="${ownerPhone}"`
        )
        continue
      }

      const { cliente, metodo } = resultado
      console.log(
        `[webhook] ✅ Cliente encontrado via ${metodo}: id="${cliente.id}"`
      )

      // Processa cada etiqueta presente no chat
      for (const labelName of labels) {
        await processarConversao(cliente, labelName, String(chat?.id ?? chat?.remoteJid ?? ''), 'chats.update')
      }
    }

    return NextResponse.json({ ok: true })
  }

  // ── labels.association ────────────────────────────────────────────────────
  if (event === 'LABELS_ASSOCIATION' || event === 'labels.association') {
    // Payload real (Evolution API v1.8.2+):
    // {
    //   "event": "labels.association",
    //   "instance": "<instanceName>",
    //   "data": {
    //     "instance": "<uuid>",
    //     "type": "add",
    //     "chatId": "5511...@s.whatsapp.net",   ← JID do contato
    //     "labelId": "4"                         ← ID numérico da etiqueta (string)
    //   }
    // }
    // A Evolution API v1.8.2 NÃO retorna o nome da etiqueta — apenas o ID.
    // Por isso comparamos o labelId diretamente com o campo conversion_label_id
    // do cliente. Se conversion_label_id não estiver preenchido, o evento é ignorado.
    const data = body?.data as Record<string, unknown> | undefined

    console.log('[webhook] 🏷️  labels.association — data:', JSON.stringify(data, null, 2))

    if (!data) {
      console.warn('[webhook] ⚠️  labels.association — campo data ausente — ignorando')
      return NextResponse.json({ ok: true, ignorado: true })
    }

    // ── Extrai labelId de body.data.labelId ───────────────────────────────
    const labelId = String(data?.labelId ?? '').trim()
    console.log(`[webhook] 🏷️  labelId extraído de data.labelId: "${labelId}"`)

    if (!labelId) {
      console.warn('[webhook] ⚠️  labels.association — labelId ausente em data.labelId — ignorando')
      return NextResponse.json({ ok: true, ignorado: true })
    }

    // ── Extrai chatId de body.data.chatId ─────────────────────────────────
    const contactId = String(data?.chatId ?? '').trim()
    console.log(`[webhook] 📱 chatId extraído de data.chatId: "${contactId}"`)

    if (!contactId) {
      console.warn('[webhook] ⚠️  labels.association — chatId ausente em data.chatId — ignorando')
      return NextResponse.json({ ok: true, ignorado: true })
    }

    // ── Extrai sender de body.sender (número do dono da instância) ────────
    // O sender identifica qual cliente dono da instância enviou o evento.
    const senderRaw   = String(body?.sender ?? '')
    const senderPhone = senderRaw.split('@')[0].replace(/\D/g, '')
    console.log(
      `[webhook] 👤 sender extraído de body.sender: "${senderRaw}" → senderPhone="${senderPhone}"`
    )

    // ── Busca cliente pelo sender ou instanceId ───────────────────────────
    const resultado = await buscarCliente(senderPhone, instanceId)
    if (!resultado) {
      console.error(
        `[webhook] ❌ labels.association — nenhum cliente encontrado para senderPhone="${senderPhone}" | instance="${instanceId}"`
      )
      return NextResponse.json({ ok: true, ignorado: true })
    }

    const { cliente, metodo } = resultado
    console.log(
      `[webhook] ✅ Cliente encontrado via ${metodo}: id="${cliente.id}" | conversion_label="${cliente.conversion_label}" | conversion_label_id="${cliente.conversion_label_id ?? '(vazio)'}"`
    )

    // ── Compara o labelId com o campo de conversão do cliente ─────────────
    // Prioridade:
    //   1. Se conversion_label_id estiver preenchido → compara com labelId (direto, sem resolver nome)
    //   2. Se conversion_label_id estiver vazio      → evento ignorado com aviso (nome não disponível na v1.8.2)
    const labelIdEsperado = String(cliente.conversion_label_id ?? '').trim()

    if (!labelIdEsperado) {
      console.warn(
        `[webhook] ⚠️  labels.association — cliente id="${cliente.id}" não tem conversion_label_id configurado. ` +
        `Preencha o campo "ID da Etiqueta" no cadastro do cliente para usar este evento. Ignorando.`
      )
      return NextResponse.json({ ok: true, ignorado: true })
    }

    console.log(
      `[webhook] 🎯 Comparando: labelId recebido="${labelId}" | conversion_label_id do cliente="${labelIdEsperado}"`
    )

    if (labelId !== labelIdEsperado) {
      console.log(
        `[webhook] ⏭️  labelId "${labelId}" !== "${labelIdEsperado}" — não é a etiqueta de conversão — ignorando`
      )
      return NextResponse.json({ ok: true, ignorado: true })
    }

    console.log(
      `[webhook] 🎉 labelId "${labelId}" BATE com conversion_label_id "${labelIdEsperado}" — processando conversão!`
    )

    // Passa o labelId como labelName para processarConversao — neste fluxo a
    // comparação já foi feita acima; processarConversao vai comparar novamente
    // com conversion_label, então passamos o valor esperado diretamente para garantir match.
    await processarConversao(
      { ...cliente, conversion_label: labelIdEsperado },
      labelId,
      contactId,
      'labels.association'
    )

    return NextResponse.json({ ok: true })
  }

  // ── Evento não tratado ────────────────────────────────────────────────────
  console.log(`[webhook] ⏭️  Evento ignorado: "${event}"`)
  return NextResponse.json({ ok: true, ignorado: true })
}
