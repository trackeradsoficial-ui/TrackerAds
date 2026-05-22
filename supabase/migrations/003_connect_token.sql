-- Adiciona campo connect_token na tabela clients
-- Usado para gerar links públicos de conexão WhatsApp sem login

alter table public.clients
  add column if not exists connect_token text unique;

create index if not exists clients_connect_token_idx
  on public.clients(connect_token);
