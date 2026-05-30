alter table public.leads
  alter column phone_raw    drop not null,
  alter column phone_hashed drop not null;
