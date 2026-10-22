-- v160: sanitized variable expense share. No direct access from Data API.
create table if not exists public.family_variable_shares (
 owner_user_id uuid primary key references auth.users(id) on delete cascade,
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false,
 monthly_budget integer not null default 0 check (monthly_budget between 0 and 5000000),
 snapshot jsonb,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.family_variable_shares enable row level security;
revoke all on table public.family_variable_shares from public, anon, authenticated;
grant select, insert, update, delete on table public.family_variable_shares to service_role;
-- Edge function verifies owner JWT for mutations, hash of 256-bit token for read-only access.
