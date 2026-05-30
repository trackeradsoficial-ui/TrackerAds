import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hashPhoneCrm } from '@/lib/crm-hash'

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json() as { name?: string; phone?: string }
    const supabase = serviceClient()

    const updates: Record<string, unknown> = {}

    if (body.name !== undefined) {
      updates.name = body.name.trim() || null
    }

    if (body.phone !== undefined) {
      const digits = body.phone.replace(/\D/g, '')
      if (!digits || digits.length < 10 || digits.length > 15) {
        return NextResponse.json({ error: 'Telefone inválido. Use apenas números, ex: 11999990000' }, { status: 400 })
      }
      updates.phone = digits
      updates.phone_hashed = hashPhoneCrm(digits)
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('crm_leads')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      const msg = error.code === '23505' ? 'Já existe um lead com esse telefone' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (e) {
    console.error('[PATCH /api/crm/leads/:id]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = serviceClient()

    const { error } = await supabase
      .from('crm_leads')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[DELETE /api/crm/leads/:id]', e)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
