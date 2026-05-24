-- Adiciona o valor 'cancelled' ao CHECK constraint de status em leads.
-- Necessário para o evento labels.association com type="remove",
-- que marca um lead como cancelado em vez de excluí-lo.

-- Remove o constraint antigo e cria um novo com os três valores permitidos.
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IN ('converted', 'pending', 'cancelled'));

COMMENT ON COLUMN public.leads.status IS
  'converted = conversão confirmada (etiqueta adicionada); '
  'cancelled = etiqueta removida (labels.association type=remove); '
  'pending = processamento pendente.';
