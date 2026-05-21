import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function adminExists(supabase: ReturnType<typeof serviceClient>) {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
  return (data?.length ?? 0) > 0
}

export async function GET() {
  const supabase = serviceClient()
  const exists = await adminExists(supabase)
  return NextResponse.json({ setup_required: !exists })
}

export async function POST(req: NextRequest) {
  const supabase = serviceClient()

  if (await adminExists(supabase)) {
    return NextResponse.json({ error: 'Setup já foi concluído.' }, { status: 403 })
  }

  const { name, email, password } = await req.json()

  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'A senha deve ter no mínimo 8 caracteres.' }, { status: 400 })
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'admin', name },
  })

  if (error) {
    const msg = error.message.includes('already registered')
      ? 'Este email já está cadastrado.'
      : `Erro ao criar conta: ${error.message}`
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Ensure profile has admin role (trigger may set wrong default)
  await supabase
    .from('profiles')
    .upsert({ id: data.user.id, role: 'admin', client_id: null })

  return NextResponse.json({ ok: true })
}
