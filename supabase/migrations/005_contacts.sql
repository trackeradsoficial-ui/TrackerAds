-- ─────────────────────────────────────────────────────────────────────────────
-- 005_contacts.sql
-- Tabela de contatos do WhatsApp por cliente.
-- Populada pelo evento CONTACTS_UPSERT da Evolution API.
-- Permite enriquecer o evento Purchase no Facebook CAPI com fn (first name)
-- e ln (last name) hasheados em SHA-256.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contacts (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   uuid        NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone       text        NOT NULL,           -- telefone normalizado (só dígitos)
  name        text,                           -- nome completo como veio do WhatsApp
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- cada telefone é único por cliente
  CONSTRAINT contacts_client_phone_unique UNIQUE (client_id, phone)
);

-- Índices
CREATE INDEX IF NOT EXISTS contacts_client_id_idx  ON public.contacts(client_id);
CREATE INDEX IF NOT EXISTS contacts_phone_idx       ON public.contacts(phone);
CREATE INDEX IF NOT EXISTS contacts_created_at_idx  ON public.contacts(created_at DESC);

-- RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Admin tem acesso total
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

-- Service role pode inserir e atualizar (webhook)
CREATE POLICY "contacts: service insert"
  ON public.contacts FOR INSERT
  WITH CHECK (true);

CREATE POLICY "contacts: service update"
  ON public.contacts FOR UPDATE
  USING (true);
