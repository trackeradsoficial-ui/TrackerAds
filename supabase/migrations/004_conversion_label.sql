-- Adiciona campo conversion_label à tabela clients
-- Define qual etiqueta do WhatsApp dispara o evento Purchase no Facebook CAPI
-- Valor padrão: "Comprou"

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS conversion_label text NOT NULL DEFAULT 'Comprou';
