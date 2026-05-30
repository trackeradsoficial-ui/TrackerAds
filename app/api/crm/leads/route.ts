import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhoneCrm } from '@/lib/crm-hash'
import type { CrmStage, CrmBoard } from '@/types'

const STAGES: CrmStage[] = ['novo', 'qualificando', 'proposta', 'negociando', 'fechado', 'perdido']

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  try {
    const supabase = serviceClient()
    const { data, error } = await supabase
      .from('crm_leads')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const board = Object.fromEntries(STAGES.map((s) => [s, []])) as unknown as CrmBoard
    for (const lead of data ?? []) {
      const stage = lead.stage as CrmStage
      if (stage in board) board[stage].push(lead)
    }

    return NextResponse.json(board)
  } catch (e) {
    console.error('[GET /api/crm/leads]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { phone, name } = await req.json() as { phone: string; name?: string }

    const digits = phone.replace(/\D/g, '')
    if (!digits || digits.length < 10 || digits.length > 15) {
      return NextResponse.json({ error: 'Telefone inválido' }, { status: 400 })
    }

    const supabase = serviceClient()
    const { data, error } = await supabase
      .from('crm_leads')
      .insert({ phone: digits, phone_hashed: hashPhoneCrm(digits), name: name ?? null })
      .select()
      .single()

    if (error) {
      const msg = error.code === '23505' ? 'Já existe um lead com esse telefone' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/crm/leads]', e)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
