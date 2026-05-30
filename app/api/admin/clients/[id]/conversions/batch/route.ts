import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { hashPhone, hashName, splitName } from '@/lib/capi'
import crypto from 'crypto'

export const maxDuration = 60

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function hashEmail(email: string): string {
  return sha256(email.trim().toLowerCase())
}

export interface RowInput {
  telefone?: string
  email?: string
  nome?: string
}

export interface BatchResult {
  identificador: string
  success: boolean
  error?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const rows: RowInput[] = body?.rows ?? []
  const eventDate: string = body?.eventDate ?? new Date().toISOString().split('T')[0]
  const validEvents = ['Purchase', 'InitiateCheckout', 'Lead']
  const eventName: string = validEvents.includes(body?.eventName) ? body.eventName : 'Purchase'

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'Nenhum registro fornecido' }, { status: 400 })
  }

  if (rows.length > 500) {
    return NextResponse.json({ error: 'Máximo de 500 registros por importação' }, { status: 400 })
  }

  const supabase = serviceClient()

  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('pixel_id, capi_token')
    .eq('id', id)
    .single()

  if (clientError || !client) {
    return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  }

  if (!client.pixel_id || !client.capi_token) {
    return NextResponse.json(
      { error: 'Pixel ID ou token CAPI não configurado para este cliente' },
      { status: 400 }
    )
  }

  const eventTimestamp = Math.floor(new Date(eventDate + 'T12:00:00Z').getTime() / 1000)

  const results: BatchResult[] = []

  for (const row of rows) {
    const telefoneRaw = row.telefone?.trim() ?? ''
    const emailRaw    = row.email?.trim() ?? ''
    const nomeRaw     = row.nome?.trim() ?? ''

    const telefoneDigits = telefoneRaw.replace(/\D/g, '')

    const identificador = telefoneDigits || emailRaw || nomeRaw || '(sem identificador)'

    if (!telefoneDigits && !emailRaw && !nomeRaw) {
      results.push({ identificador, success: false, error: 'Nenhum identificador válido na linha' })
      continue
    }

    if (telefoneDigits && (telefoneDigits.length < 10 || telefoneDigits.length > 15)) {
      results.push({ identificador, success: false, error: 'Telefone inválido (deve ter entre 10 e 15 dígitos)' })
      continue
    }

    const userData: Record<string, string[]> = {}

    if (telefoneDigits) {
      userData.ph = [hashPhone(telefoneDigits)]
    }

    if (emailRaw) {
      userData.em = [hashEmail(emailRaw)]
    }

    if (nomeRaw) {
      const { firstName, lastName } = splitName(nomeRaw)
      if (firstName) userData.fn = [hashName(firstName)]
      if (lastName)  userData.ln = [hashName(lastName)]
    }

    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        client_id:           id,
        phone_raw:           telefoneDigits || null,
        phone_hashed:        userData.ph?.[0] ?? null,
        label:               eventName,
        status:              'converted',
        facebook_event_sent: false,
      })
      .select()
      .single()

    if (insertError || !lead) {
      results.push({ identificador, success: false, error: insertError?.message ?? 'Erro ao salvar' })
      continue
    }

    let capiSuccess = false
    let capiResponse: Record<string, unknown> = {}

    try {
      const result = await sendCapiEventWithUserData(
        client.pixel_id,
        client.capi_token,
        userData,
        eventTimestamp,
        eventName
      )
      capiSuccess  = result.success
      capiResponse = result.response
    } catch (err) {
      capiResponse = { error: String(err) }
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({
        facebook_event_sent:     capiSuccess,
        facebook_event_response: capiResponse,
      })
      .eq('id', lead.id)

    if (updateError) {
      console.error('[batch] UPDATE error:', updateError.message)
    }

    results.push({
      identificador,
      success:  capiSuccess,
      error: capiSuccess ? undefined : 'Falha no envio ao Facebook',
    })
  }

  const successCount = results.filter((r) => r.success).length
  const errorCount   = results.filter((r) => !r.success).length

  return NextResponse.json({ results, successCount, errorCount })
}

async function sendCapiEventWithUserData(
  pixelId:    string,
  capiToken:  string,
  userData:   Record<string, string[]>,
  eventTime:  number,
  eventName = 'Purchase'
): Promise<{ success: boolean; response: Record<string, unknown> }> {
  const payload = {
    data: [
      {
        event_name:    eventName,
        event_time:    eventTime,
        action_source: 'other',
        user_data:     userData,
        custom_data: {
          currency: 'BRL',
          value: 1,
        },
      },
    ],
  }

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${capiToken}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  controller.signal,
    })
    clearTimeout(timeout)

    const json = (await res.json()) as Record<string, unknown>
    return { success: res.ok, response: json }
  } catch (err) {
    return { success: false, response: { error: String(err) } }
  }
}
