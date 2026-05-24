-- Adiciona o campo conversion_label_id na tabela clients
-- Permite que o admin informe o ID numérico da etiqueta do WhatsApp Business
-- em vez de (ou além de) o nome textual em conversion_label.
-- Se preenchido, o webhook usa o ID para comparar com o labelId do evento
-- labels.association; caso contrário, usa o nome em conversion_label.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS conversion_label_id TEXT DEFAULT NULL;

COMMENT ON COLUMN clients.conversion_label_id IS
  'ID numérico da etiqueta do WhatsApp Business (ex: "4"). '
  'Quando preenchido, o webhook compara este ID com o labelId recebido no evento '
  'labels.association. Se vazio, usa o campo conversion_label (nome textual).';
