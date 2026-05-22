import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Rota PÚBLICA — não requer autenticação
// Valida o connect_token e retorna o status da conexão WhatsApp

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/connect/[token]/status
// Retorna o estado atual da conexão WhatsApp para o token fornecido
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Valida o token no banco de dados
  const { data: client, error } = await serviceClient()
    .from('clients')
    .select('id')
    .eq('connect_token', token)
    .single()

  if (error || !client) {
    return NextResponse.json(
      { error: 'Token inválido ou expirado.' },
      { status: 404 }
    )
  }

  const clientId = client.id

  const stateRes = await fetch(`${EVOLUTION_URL}/instance/connectionState/${clientId}`, {
    headers: { apikey: EVOLUTION_KEY },
  })

  if (!stateRes.ok) {
    return NextResponse.json({ state: 'unknown' })
  }

  const stateData = await stateRes.json()
  const state: string =
    stateData?.instance?.state ?? stateData?.state ?? 'unknown'
  const isOpen = state === 'open'

  if (isOpen) {
    // Atualiza o status para "connected" no Supabase
    await serviceClient()
      .from('clients')
      .update({ whatsapp_status: 'connected' })
      .eq('id', clientId)
  }

  return NextResponse.json({ state })
}
