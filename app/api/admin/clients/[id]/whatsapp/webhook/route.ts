import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

const EVOLUTION_URL = process.env.EVOLUTION_API_URL!
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY!
const APP_URL = 'https://tracker-ads-eta.vercel.app'

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

// POST /api/admin/clients/[id]/whatsapp/webhook
// Configura o webhook na Evolution API para a instância do cliente
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params

  const res = await fetch(`${EVOLUTION_URL}/webhook/set/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: EVOLUTION_KEY,
    },
    body: JSON.stringify({
      url: `${APP_URL}/api/webhooks/whatsapp`,
      webhook_by_events: false,
      webhook_base64: false,
      // LABELS_ASSOCIATION: detecta adição/remoção de etiqueta de conversão
      // CONTACTS_UPSERT:    salva nome+telefone para enriquecer o evento CAPI
      events: ['LABELS_ASSOCIATION', 'CONTACTS_UPSERT'],
      enabled: true,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error('[webhook/set] Erro ao configurar webhook:', err)
    return NextResponse.json(
      { error: `Erro ao configurar webhook: ${err}` },
      { status: 502 }
    )
  }

  const data = await res.json()
  console.log(`[webhook/set] Webhook configurado para instância "${id}":`, data)

  return NextResponse.json({ ok: true, data })
}
