import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhoneCrm } from '@/lib/crm-hash'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Record<string, unknown>
    if (body.event !== 'messages.upsert') return NextResponse.json({ ok: true })

    const data = body.data as Record<string, unknown>
    const key = data?.key as Record<string, unknown> | undefined
    const remoteJid: string = (key?.remoteJid as string) ?? ''

    if (remoteJid.includes('@g.us')) return NextResponse.json({ ok: true })

    const phone = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
    if (!phone) return NextResponse.json({ ok: true })

    const message = data?.message as Record<string, unknown> | undefined
    const extMsg = message?.extendedTextMessage as Record<string, unknown> | undefined
    const content: string = (message?.conversation as string) ?? (extMsg?.text as string) ?? ''
    const direction: 'in' | 'out' = key?.fromMe ? 'out' : 'in'
    const phone_hashed = hashPhoneCrm(phone)

    const supabase = serviceClient()

    const { data: lead, error } = await supabase
      .from('crm_leads')
      .upsert(
        { phone, phone_hashed, last_message: content },
        { onConflict: 'phone', ignoreDuplicates: false }
      )
      .select()
      .single()

    if (error) {
      console.error('[crm/webhook] upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (lead && content) {
      await supabase.from('crm_messages').insert({
        lead_id: lead.id,
        direction,
        content,
        timestamp: new Date().toISOString(),
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[crm/webhook]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
