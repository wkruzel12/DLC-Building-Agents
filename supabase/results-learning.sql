-- Apply after schema.sql, cases.sql, and stakeholders.sql. No scoring rules change.
create unique index if not exists idx_attempts_review_owner on public.attempts(id,user_id,scenario_id);
create table if not exists public.attempt_learning (
 attempt_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 case_id text not null,
 reflection text not null default '' check (length(reflection)<=1500),
 acknowledged_below_target boolean not null default false,
 coaching jsonb,
 updated_at timestamptz not null default now(),
 foreign key(attempt_id,user_id,case_id) references public.attempts(id,user_id,scenario_id) on delete cascade
);
alter table public.attempt_learning enable row level security;
revoke all on public.attempt_learning from public,anon,authenticated;
grant select on public.attempt_learning to authenticated;
grant all on public.attempt_learning to service_role;
drop policy if exists "View own attempt learning" on public.attempt_learning;
create policy "View own attempt learning" on public.attempt_learning for select to authenticated using ((select auth.uid())=user_id);
-- Remove grading copies from student-readable result JSON, including historical rows.
-- Original instructor case answer keys stay in their existing server/private storage.
create or replace function public.redact_attempt_grading() returns trigger
language plpgsql set search_path='' as $$
begin
 new.results=(select coalesce(jsonb_agg(item-'expected_decision'-'correct_decision'-'answer_key'-'note' order by ordinal),'[]'::jsonb) from jsonb_array_elements(new.results) with ordinality as entries(item,ordinal));
 return new;
end $$;
revoke all on function public.redact_attempt_grading() from public,anon,authenticated;
drop trigger if exists redact_attempt_grading on public.attempts;
create trigger redact_attempt_grading before insert or update of results on public.attempts for each row execute function public.redact_attempt_grading();
update public.attempts set results=results where exists(select 1 from jsonb_array_elements(results) as item where item ?| array['expected_decision','correct_decision','answer_key','note']);
