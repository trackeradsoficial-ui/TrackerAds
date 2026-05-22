import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

const APP_URL = 'https://tracker-ads-eta.vercel.app'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function requireAdmin() {
  const supabase = await createServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role === 'admin' ? user : null
}

// POST /api/admin/clients/[id]/whatsapp/link
// Gera um token único, salva no campo connect_token do cliente
// e retorna a URL pública para conexão sem login
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  // Gera token seguro de 32 bytes (64 chars hex)
  const token = randomBytes(32).toString('hex')

  const { error } = await serviceClient()
    .from('clients')
    .update({ connect_token: token })
    .eq('id', id)

  if (error) {
    console.error('[link] Erro ao salvar token:', error)
    return NextResponse.json(
      { error: 'Erro ao gerar link de conexão' },
      { status: 500 }
    )
  }

  const url = `${APP_URL}/connect/${token}`
  return NextResponse.json({ url })
}
