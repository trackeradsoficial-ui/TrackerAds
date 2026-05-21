'use server'

import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function login(formData: FormData) {
  const supabase = await createClient()

  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: 'Email ou senha inválidos.' }
  }

  redirect('/')
}

export async function register(email: string, password: string) {
  // Create user server-side (confirmed, no email verification needed)
  const service = await createServiceClient()
  const { data, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: 'client' },
  })

  if (createError) {
    const msg =
      createError.message.includes('already registered') ||
      createError.message.includes('already been registered')
        ? 'Este email já está cadastrado.'
        : `Erro ao criar conta: ${createError.message}`
    return { error: msg }
  }

  // Sign in to set session cookies
  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) return { error: 'Conta criada, mas erro ao entrar. Tente fazer login.' }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function createClientUser(
  clientId: string,
  email: string,
  password: string
) {
  const supabase = await createServiceClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'client',
      client_id: clientId,
    },
  })

  if (error) throw error
  return data.user
}
