create table public.client_event_labels (
  id         uuid primary key default uuid_generate_v4(),
  client_id  uuid not null references public.clients(id) on delete cascade,
  label      text not null,
  event_name text not null check (event_name in ('Purchase', 'InitiateCheckout', 'Lead')),
  created_at timestamptz not null default now(),
  unique (client_id, label)
);

alter table public.client_event_labels enable row level security;

create policy "client_event_labels: admin full access"
  on public.client_event_labels for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
