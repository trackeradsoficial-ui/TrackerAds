import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Todos os campos são obrigatórios.' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'A senha deve ter no mínimo 8 caracteres.' }, { status: 400 })
  }

  const supabase = serviceClient()

  // Create user with email already confirmed (no confirmation email needed)
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'client' },
  })

  if (error) {
    const msg = error.message.includes('already registered') || error.message.includes('already been registered')
      ? 'Este email já está cadastrado.'
      : `Erro ao criar conta: ${error.message}`
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Profile is created by the trigger with role 'client'
  return NextResponse.json({ ok: true, userId: data.user.id })
}
