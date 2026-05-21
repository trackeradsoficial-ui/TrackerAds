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

export async function POST(req: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { company_name, email, whatsapp_number, pixel_id, capi_token, password } = await req.json()

  if (!company_name || !email || !whatsapp_number || !pixel_id || !capi_token || !password) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  const supabase = serviceClient()

  // Create client record first
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({ company_name, email, whatsapp_number, pixel_id, capi_token })
    .select()
    .single()

  if (clientError) {
    const msg = clientError.message.includes('unique')
      ? 'Email ou número de WhatsApp já cadastrado.'
      : 'Erro ao criar cliente.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Create auth user linked to client
  const { error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'client',
      client_id: client.id,
    },
  })

  if (authError) {
    // Rollback client record
    await supabase.from('clients').delete().eq('id', client.id)
    return NextResponse.json({ error: `Erro ao criar usuário: ${authError.message}` }, { status: 400 })
  }

  return NextResponse.json({ client }, { status: 201 })
}
