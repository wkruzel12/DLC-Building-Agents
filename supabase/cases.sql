-- Durable server-only case storage. Apply after schema.sql for deployed uploads.
create table if not exists public.private_cases (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 scenario jsonb not null,
 created_at timestamptz not null default now()
);
create index if not exists idx_private_cases_owner on public.private_cases(owner_id);
alter table public.private_cases enable row level security;
-- The JSON contains grading keys. Never grant browser SELECT, including to owners.
-- API routes use a server-only service key and explicitly filter owner_id.
revoke all on public.private_cases from public,anon,authenticated;
grant all on public.private_cases to service_role;
