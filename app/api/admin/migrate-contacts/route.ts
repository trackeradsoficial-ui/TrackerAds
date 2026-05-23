import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Rota one-shot — cria a tabela contacts (migration 005)
// Método: POST /api/admin/migrate-contacts
// Requer sessão de admin ativa.
export async function POST() {
  // Verifica autenticação admin
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data: profile } = await serverClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin')
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Executa os statements da migration 005 individualmente
  const statements = [
    // 1. Tabela principal
    `CREATE TABLE IF NOT EXISTS public.contacts (
      id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
      client_id  uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
      phone      text        NOT NULL,
      name       text,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT contacts_client_phone_unique UNIQUE (client_id, phone)
    )`,

    // 2. Índices
    `CREATE INDEX IF NOT EXISTS contacts_client_id_idx ON public.contacts(client_id)`,
    `CREATE INDEX IF NOT EXISTS contacts_phone_idx      ON public.contacts(phone)`,
    `CREATE INDEX IF NOT EXISTS contacts_created_at_idx ON public.contacts(created_at DESC)`,

    // 3. RLS
    `ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY`,

    // 4. Policies
    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'contacts'
           AND policyname = 'contacts: admin full access'
       ) THEN
         CREATE POLICY "contacts: admin full access"
           ON public.contacts FOR ALL
           USING (
             EXISTS (
               SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin'
             )
           )
           WITH CHECK (
             EXISTS (
               SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin'
             )
           );
       END IF;
     END $$`,

    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'contacts'
           AND policyname = 'contacts: service insert'
       ) THEN
         CREATE POLICY "contacts: service insert"
           ON public.contacts FOR INSERT
           WITH CHECK (true);
       END IF;
     END $$`,

    `DO $$
     BEGIN
       IF NOT EXISTS (
         SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename  = 'contacts'
           AND policyname = 'contacts: service update'
       ) THEN
         CREATE POLICY "contacts: service update"
           ON public.contacts FOR UPDATE
           USING (true);
       END IF;
     END $$`,
  ]

  const resultados: { sql: string; ok: boolean; erro?: string }[] = []

  for (const sql of statements) {
    const { error } = await supabase.rpc('run_migration', { sql })
    resultados.push({
      sql:  sql.slice(0, 60).replace(/\s+/g, ' ') + '…',
      ok:   !error,
      erro: error?.message,
    })
    if (error) {
      console.error('[migrate-contacts] Erro:', error.message, '\nSQL:', sql)
    }
  }

  const falhas = resultados.filter((r) => !r.ok)
  if (falhas.length > 0) {
    return NextResponse.json({ ok: false, resultados }, { status: 500 })
  }

  return NextResponse.json({ ok: true, resultados })
}
