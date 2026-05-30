import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const supabase = serviceClient()

  const { data, error } = await supabase
    .from('client_event_labels')
    .select('*')
    .eq('client_id', id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { label, event_name } = await req.json()

  if (!label?.trim() || !event_name) {
    return NextResponse.json({ error: 'Etiqueta e evento são obrigatórios' }, { status: 400 })
  }

  const validEvents = ['Purchase', 'InitiateCheckout', 'Lead']
  if (!validEvents.includes(event_name)) {
    return NextResponse.json({ error: 'Evento inválido' }, { status: 400 })
  }

  const supabase = serviceClient()

  const { data, error } = await supabase
    .from('client_event_labels')
    .insert({ client_id: id, label: label.trim(), event_name })
    .select()
    .single()

  if (error) {
    const msg = error.code === '23505' ? 'Essa etiqueta já está mapeada' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const { labelId } = await req.json()

  if (!labelId) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 })

  const supabase = serviceClient()

  const { error } = await supabase
    .from('client_event_labels')
    .delete()
    .eq('id', labelId)
    .eq('client_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
