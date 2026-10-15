-- Apply after schema.sql (and cases.sql for uploaded cases).
create unique index if not exists idx_attempts_review_owner on public.attempts(id,user_id,scenario_id);
create table if not exists public.stakeholder_reviews (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 attempt_id uuid not null,
 case_id text not null,
 state jsonb not null,
 version integer not null default 0 check (version>=0),
 lease_token uuid,
 lease_until timestamptz not null default '1970-01-01 00:00:00+00',
 created_at timestamptz not null default now(),
 unique(user_id,attempt_id),
 foreign key(attempt_id,user_id,case_id) references public.attempts(id,user_id,scenario_id) on delete cascade
);
alter table public.stakeholder_reviews enable row level security;
revoke all on public.stakeholder_reviews from public,anon,authenticated;
grant select on public.stakeholder_reviews to authenticated;
grant all on public.stakeholder_reviews to service_role;
drop policy if exists "View own stakeholder reviews" on public.stakeholder_reviews;
create policy "View own stakeholder reviews" on public.stakeholder_reviews for select to authenticated using ((select auth.uid())=user_id);
-- Clients cannot write transcripts, personas, leases, scores, or reflections.
create table if not exists public.stakeholder_message_reservations (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create index if not exists idx_stakeholder_message_budget on public.stakeholder_message_reservations(user_id,created_at);
alter table public.stakeholder_message_reservations enable row level security;
revoke all on public.stakeholder_message_reservations from public,anon,authenticated;
grant all on public.stakeholder_message_reservations to service_role;
grant usage,select on sequence public.stakeholder_message_reservations_id_seq to service_role;
create or replace function public.reserve_stakeholder_message(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare minute_count integer; hour_count integer;
begin
 if p_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
 perform pg_advisory_xact_lock(hashtext('stakeholders:'||p_user_id::text));
 delete from public.stakeholder_message_reservations where user_id=p_user_id and created_at<=now()-interval '1 hour';
 select count(*),count(*) filter(where created_at>now()-interval '1 minute') into hour_count,minute_count
 from public.stakeholder_message_reservations where user_id=p_user_id;
 if minute_count>=12 or hour_count>=120 then raise exception 'MESSAGE_LIMIT'; end if;
 insert into public.stakeholder_message_reservations(user_id) values(p_user_id);
end $$;
revoke all on function public.reserve_stakeholder_message(uuid) from public,anon,authenticated;
grant execute on function public.reserve_stakeholder_message(uuid) to service_role;
