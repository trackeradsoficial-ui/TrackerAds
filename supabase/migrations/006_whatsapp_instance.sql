-- ─────────────────────────────────────────────────────────────────────────────
-- 006_whatsapp_instance.sql
-- Adiciona coluna whatsapp_instance à tabela clients.
-- Armazena o ID da instância na Evolution API (ex: a171860c-d572-4423-...)
-- Usado pelo webhook para identificar o cliente sem depender do número.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_instance text;

CREATE INDEX IF NOT EXISTS clients_whatsapp_instance_idx
  ON public.clients(whatsapp_instance)
  WHERE whatsapp_instance IS NOT NULL;
