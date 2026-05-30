import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = serviceClient()
    const { data, error } = await supabase
      .from('crm_messages')
      .select('*')
      .eq('lead_id', id)
      .order('timestamp', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  } catch (e) {
    console.error('[GET /api/crm/leads/:id/messages]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
