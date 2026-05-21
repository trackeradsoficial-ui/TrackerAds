-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────
-- PROFILES (linked to auth.users)
-- ─────────────────────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'client')),
  client_id   uuid, -- filled for client role; null for admin
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Admin can read all profiles; users can read their own
create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: admin read all"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Only service role can insert/update profiles (done server-side)
create policy "profiles: service insert"
  on public.profiles for insert
  with check (true);

create policy "profiles: service update"
  on public.profiles for update
  using (true);

-- ─────────────────────────────────────────
-- CLIENTS
-- ─────────────────────────────────────────
create table public.clients (
  id                uuid primary key default uuid_generate_v4(),
  company_name      text not null,
  email             text not null unique,
  whatsapp_number   text not null unique,
  pixel_id          text not null,
  capi_token        text not null,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

alter table public.clients enable row level security;

-- Admin sees all clients
create policy "clients: admin full access"
  on public.clients for all
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

-- Client sees only their own record
create policy "clients: own read"
  on public.clients for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.client_id = clients.id
    )
  );

-- ─────────────────────────────────────────
-- LEADS
-- ─────────────────────────────────────────
create table public.leads (
  id                        uuid primary key default uuid_generate_v4(),
  client_id                 uuid not null references public.clients(id) on delete cascade,
  phone_raw                 text not null,
  phone_hashed              text not null,
  label                     text,
  status                    text not null default 'converted' check (status in ('converted', 'pending')),
  facebook_event_sent       boolean not null default false,
  facebook_event_response   jsonb,
  created_at                timestamptz not null default now()
);

alter table public.leads enable row level security;

-- Admin sees all leads
create policy "leads: admin full access"
  on public.leads for all
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

-- Client sees only their leads
create policy "leads: own read"
  on public.leads for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.client_id = leads.client_id
    )
  );

-- Service role insert (webhook)
create policy "leads: service insert"
  on public.leads for insert
  with check (true);

create policy "leads: service update"
  on public.leads for update
  using (true);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
create index leads_client_id_idx on public.leads(client_id);
create index leads_created_at_idx on public.leads(created_at desc);
create index clients_whatsapp_number_idx on public.clients(whatsapp_number);

-- ─────────────────────────────────────────
-- FUNCTION: auto-create profile on signup
-- ─────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, client_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    (new.raw_user_meta_data->>'client_id')::uuid
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
