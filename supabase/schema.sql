-- Paste into Supabase SQL Editor once. No answer key is stored in browser-accessible rows.
create table if not exists public.attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 scenario_id text not null,
 attempt_number integer not null check (attempt_number>0),
 steps jsonb not null,
 results jsonb not null,
 planted_caught integer not null,
 planted_total integer not null,
 accuracy integer not null check (accuracy between 0 and 100),
 errors integer not null default 0,
 mode text not null check (mode in ('demo','openai')),
 created_at timestamptz not null default now(),
 unique (user_id,scenario_id,attempt_number)
);
create index if not exists idx_attempts_user_scenario on public.attempts(user_id,scenario_id,created_at desc);
alter table public.attempts enable row level security;
create policy "Students can view own attempts" on public.attempts for select to authenticated using ((select auth.uid())=user_id);
-- Writes are restricted to the server function below rather than arbitrary browser requests.
revoke insert,update,delete on public.attempts from anon,authenticated;
create table if not exists public.run_reservations (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 scenario_id text not null,
 created_at timestamptz not null default now()
);
create index if not exists idx_run_reservations on public.run_reservations(user_id,created_at);
alter table public.run_reservations enable row level security;
revoke all on public.run_reservations from anon,authenticated;
-- Called by an authenticated server request; serializes reservations per user.
create or replace function public.reserve_run(p_scenario_id text) returns integer
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); recent integer; n integer;
begin
 if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
 perform pg_advisory_xact_lock(hashtext(uid::text));
 select count(*) into recent from public.run_reservations where user_id=uid and created_at>now()-interval '1 hour';
 if recent>=15 then raise exception 'RUN_LIMIT: Maximum 15 runs per hour'; end if;
 insert into public.run_reservations(user_id,scenario_id) values(uid,p_scenario_id);
 select count(*)+1 into n from public.run_reservations where user_id=uid and scenario_id=p_scenario_id and id < currval(pg_get_serial_sequence('public.run_reservations','id'));
 return n;
end $$;
revoke all on function public.reserve_run(text) from public;
grant execute on function public.reserve_run(text) to authenticated;
