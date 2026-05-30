import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { sale_value, currency } = await req.json() as { sale_value: number; currency: string }
    const supabase = serviceClient()

    const { error } = await supabase
      .from('crm_leads')
      .update({ sale_value, currency: currency ?? 'BRL' })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/crm/leads/:id/sale]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
