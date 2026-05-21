import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhone, sendCapiEvent } from '@/lib/capi'

// Service-role client — bypasses RLS for webhook processing
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Evolution API sends a GET with hub.challenge for webhook verification
export async function GET(req: NextRequest) {
  const challenge = req.nextUrl.searchParams.get('hub.challenge')
  if (challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  try {
    // Optional webhook secret verification
    const secret = process.env.WEBHOOK_SECRET
    if (secret) {
      const incoming = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')
      if (incoming !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await req.json()

    // Evolution API webhook event for label assignment
    // Event: "labels.upsert" or "chats.upsert" — label name "Comprou"
    const event: string = body?.event ?? body?.type ?? ''
    const data = body?.data ?? body

    // Extract label name and remote JID (phone number)
    let labelName: string | undefined
    let remoteJid: string | undefined

    if (event === 'labels.upsert' || event === 'label.association') {
      labelName = data?.label?.name ?? data?.labelName ?? data?.label
      remoteJid = data?.id ?? data?.remoteJid ?? data?.contact?.remoteJid
    } else if (event === 'chats.upsert') {
      // Some Evolution versions embed label in chat upsert
      labelName = data?.labels?.[0] ?? data?.label
      remoteJid = data?.id ?? data?.remoteJid
    } else {
      // Unsupported event — acknowledge and skip
      return NextResponse.json({ ok: true, skipped: true })
    }

    if (!labelName || !remoteJid) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'missing label or jid' })
    }

    // Only process "Comprou" label (case-insensitive)
    if (labelName.toLowerCase().trim() !== 'comprou') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'label not Comprou' })
    }

    // Normalize phone: Evolution JID format is "5511999999999@s.whatsapp.net"
    const phoneRaw = remoteJid.split('@')[0]

    // The webhook doesn't carry which instance (WhatsApp number) it came from
    // Evolution sends the instance name in the payload
    const instanceName: string = body?.instance ?? data?.instance ?? ''

    const supabase = getServiceClient()

    // Look up client by WhatsApp number OR instance name
    // whatsapp_number stored as digits only (e.g. "5511999999999")
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, pixel_id, capi_token, whatsapp_number, is_active')
      .or(`whatsapp_number.eq.${phoneRaw},whatsapp_number.eq.${instanceName}`)
      .eq('is_active', true)
      .single()

    if (clientError || !client) {
      console.error('Client not found for instance/number:', instanceName, phoneRaw, clientError)
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const phoneHashed = hashPhone(phoneRaw)

    // Insert lead record
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        client_id: client.id,
        phone_raw: phoneRaw,
        phone_hashed: phoneHashed,
        label: labelName,
        status: 'converted',
        facebook_event_sent: false,
      })
      .select()
      .single()

    if (leadError || !lead) {
      console.error('Failed to insert lead:', leadError)
      return NextResponse.json({ error: 'Failed to save lead' }, { status: 500 })
    }

    // Send CAPI event
    const { success, response: capiResponse } = await sendCapiEvent(
      client.pixel_id,
      client.capi_token,
      phoneHashed
    )

    // Update lead with CAPI result
    await supabase
      .from('leads')
      .update({
        facebook_event_sent: success,
        facebook_event_response: capiResponse,
      })
      .eq('id', lead.id)

    return NextResponse.json({ ok: true, lead_id: lead.id, capi_sent: success })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
