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
  pixelId:      string
  capiToken:    string
  phoneHashed:  string
  fnHashed?:    string
  lnHashed?:    string
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

  // ── 2. Filtra apenas chats.update / CHATS_UPDATE ──────────────────────────
  const event = String(body?.event ?? body?.type ?? '')
  console.log(`[webhook] 📌 Evento: "${event}"`)

  if (event !== 'CHATS_UPDATE' && event !== 'chats.update') {
    console.log(`[webhook] ⏭️  Evento ignorado: "${event}"`)
    return NextResponse.json({ ok: true, ignorado: true })
  }

  // ── 3. Normaliza data para array ──────────────────────────────────────────
  const rawData = body?.data
  const chats: Record<string, unknown>[] = Array.isArray(rawData)
    ? rawData as Record<string, unknown>[]
    : rawData != null
      ? [rawData as Record<string, unknown>]
      : []

  const instanceId = String(body?.instance ?? body?.instanceName ?? '')
  console.log(
    `[webhook] 🔄 CHATS_UPDATE — instance="${instanceId}" | ${chats.length} chat(s)`
  )

  // ── 4. Processa cada chat ─────────────────────────────────────────────────
  for (const [idx, chat] of chats.entries()) {
    console.log(
      `[webhook] 📋 Chat [${idx + 1}/${chats.length}]:`,
      JSON.stringify(chat, null, 2)
    )

    // ── 4a. Extrai ownerPhone ───────────────────────────────────────────────
    const ownerRaw = String(
      chat?.owner ?? body?.sender ?? ''
    )
    const ownerPhone = ownerRaw.split('@')[0].replace(/\D/g, '')

    console.log(
      `[webhook] 👤 ownerRaw="${ownerRaw}" → ownerPhone="${ownerPhone}"`
    )

    if (!ownerPhone || ownerPhone.length < 8) {
      console.warn(`[webhook] ⚠️  Chat [${idx + 1}] — ownerPhone inválido ("${ownerPhone}") — ignorando`)
      continue
    }

    // ── 4b. Extrai labels ───────────────────────────────────────────────────
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

    console.log(
      `[webhook] 🏷️  Etiquetas do chat: ${JSON.stringify(labels)}`
    )

    // ── 4c. Busca cliente por ownerPhone (ILIKE sufixo) ─────────────────────
    // Monta candidatos: com DDI, sem DDI, sem DDI e sem nono dígito
    const candidatos: string[] = [ownerPhone]
    if (ownerPhone.startsWith('55') && ownerPhone.length === 13) {
      const semDDI = ownerPhone.slice(2)          // ex: "19982250102"
      candidatos.push(semDDI)
      if (semDDI.length === 11) {
        candidatos.push(semDDI.slice(0, 2) + semDDI.slice(3))  // ex: "1982250102"
      }
    }

    let cliente: Record<string, unknown> | null = null
    let metodoEncontrado = ''

    for (const candidato of candidatos) {
      console.log(
        `[webhook] 🔎 Buscando cliente com whatsapp_number ILIKE "%${candidato}"`
      )

      const { data, error } = await supabase
        .from('clients')
        .select('id, pixel_id, capi_token, whatsapp_number, whatsapp_instance, conversion_label')
        .ilike('whatsapp_number', `%${candidato}`)
        .eq('is_active', true)
        .maybeSingle()

      if (error) {
        console.error(
          `[webhook] ⚠️  Erro na busca por "%${candidato}":`, error.message
        )
        continue
      }

      if (data) {
        cliente = data as Record<string, unknown>
        metodoEncontrado = `whatsapp_number ILIKE "%${candidato}"`
        break
      }
    }

    // Fallback: busca por whatsapp_instance
    if (!cliente && instanceId) {
      console.log(
        `[webhook] 🔎 Fallback: buscando cliente com whatsapp_instance="${instanceId}"`
      )

      const { data, error } = await supabase
        .from('clients')
        .select('id, pixel_id, capi_token, whatsapp_number, whatsapp_instance, conversion_label')
        .eq('whatsapp_instance', instanceId)
        .eq('is_active', true)
        .maybeSingle()

      if (!error && data) {
        cliente = data as Record<string, unknown>
        metodoEncontrado = `whatsapp_instance="${instanceId}"`
      }
    }

    if (!cliente) {
      console.error(
        `[webhook] ❌ Chat [${idx + 1}] — nenhum cliente encontrado para ownerPhone="${ownerPhone}" | instance="${instanceId}"`
      )
      continue
    }

    console.log(
      `[webhook] ✅ Cliente encontrado via ${metodoEncontrado}: id="${cliente.id}" | número no banco="${cliente.whatsapp_number}"`
    )

    // ── 4d. Verifica etiqueta de conversão ──────────────────────────────────
    const labelEsperada = String(cliente.conversion_label ?? 'Comprou').toLowerCase().trim()
    const temConversao  = labels.some(
      (l) => l.toLowerCase().trim() === labelEsperada
    )

    console.log(
      `[webhook] 🎯 Etiqueta esperada: "${labelEsperada}" | detectada: ${temConversao}`
    )

    if (!temConversao) {
      console.log(
        `[webhook] ⏭️  Chat [${idx + 1}] — etiqueta "${labelEsperada}" não presente — ignorando`
      )
      continue
    }

    console.log(`[webhook] 🎉 Etiqueta "${labelEsperada}" DETECTADA!`)

    // ── 4e. Extrai telefone do contato (id do chat) ─────────────────────────
    const chatId   = String(chat?.id ?? chat?.remoteJid ?? '')
    const phoneRaw = chatId.split('@')[0]

    console.log(
      `[webhook] 📱 chatId="${chatId}" → phoneRaw="${phoneRaw}"`
    )

    if (!phoneRaw || phoneRaw.length < 5) {
      console.warn(
        `[webhook] ⚠️  Chat [${idx + 1}] — telefone inválido ("${phoneRaw}") — ignorando`
      )
      continue
    }

    // ── 4f. Hasheia o telefone ──────────────────────────────────────────────
    const phoneHashed = hashPhone(phoneRaw)
    console.log(
      `[webhook] 🔐 phoneRaw="${phoneRaw}" → phoneHashed="${phoneHashed.slice(0, 16)}..."`
    )

    // ── 4g. Busca nome do contato para enriquecer o CAPI ───────────────────
    const phoneNormalizado = phoneRaw.replace(/\D/g, '')
    const { data: contatoRow } = await supabase
      .from('contacts')
      .select('name')
      .eq('client_id', cliente.id)
      .eq('phone', phoneNormalizado)
      .maybeSingle()

    const nomeCompleto = String((contatoRow as Record<string, unknown> | null)?.name ?? '')
    console.log(
      `[webhook] 👤 Nome do contato: "${nomeCompleto || '(não encontrado)'}"`
    )

    let fnHashed: string | undefined
    let lnHashed: string | undefined

    if (nomeCompleto) {
      const { firstName, lastName } = splitName(nomeCompleto)
      if (firstName) {
        fnHashed = hashName(firstName)
        console.log(`[webhook] 🔐 fn="${firstName}" → ${fnHashed.slice(0, 16)}...`)
      }
      if (lastName) {
        lnHashed = hashName(lastName)
        console.log(`[webhook] 🔐 ln="${lastName}" → ${lnHashed.slice(0, 16)}...`)
      }
    }

    // ── 4h. Insere lead ─────────────────────────────────────────────────────
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
        `[webhook] ❌ Erro ao inserir lead:`,
        erroLead?.message ?? 'retorno nulo'
      )
      continue
    }

    const leadId = String((leadInserido as Record<string, unknown>).id)
    console.log(`[webhook] ✅ Lead inserido: id="${leadId}"`)

    // ── 4i. Dispara evento Purchase no Facebook CAPI ────────────────────────
    console.log(
      `[webhook] 📡 Disparando CAPI — pixel="${cliente.pixel_id}"` +
      (fnHashed ? ' +fn' : '') +
      (lnHashed ? ' +ln' : '')
    )

    const { sucesso, resposta } = await sendCapiEvent({
      pixelId:     String(cliente.pixel_id),
      capiToken:   String(cliente.capi_token),
      phoneHashed,
      fnHashed,
      lnHashed,
    })

    console.log(
      `[webhook] ${sucesso ? '✅' : '❌'} CAPI: sucesso=${sucesso} | ${JSON.stringify(resposta)}`
    )

    // ── 4j. Atualiza lead com resultado do CAPI ─────────────────────────────
    const { error: erroUpdate } = await supabase
      .from('leads')
      .update({
        facebook_event_sent:     sucesso,
        facebook_event_response: resposta,
      })
      .eq('id', leadId)

    if (erroUpdate) {
      console.error(
        `[webhook] ⚠️  Falha ao atualizar lead "${leadId}":`, erroUpdate.message
      )
    } else {
      console.log(`[webhook] 🏁 Lead "${leadId}" finalizado`)
    }
  }

  return NextResponse.json({ ok: true })
}
