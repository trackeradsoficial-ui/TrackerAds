-- Add whatsapp_status column to clients table
alter table public.clients
  add column if not exists whatsapp_status text not null default 'disconnected'
  check (whatsapp_status in ('connected', 'disconnected', 'connecting'));
