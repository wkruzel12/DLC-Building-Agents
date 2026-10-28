-- Instructor classroom mode. Apply after schema.sql and cases.sql.
-- Instructors are identified by the INSTRUCTOR_EMAILS server setting, not by a table.

-- A case an instructor publishes gets a join code that students enter.
alter table public.private_cases add column if not exists join_code text;
create unique index if not exists idx_private_cases_join_code on public.private_cases(join_code) where join_code is not null;
alter table public.private_cases drop constraint if exists private_cases_join_code_format;
alter table public.private_cases add constraint private_cases_join_code_format check (join_code is null or join_code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$');

-- Which students joined which instructor case.
create table if not exists public.case_enrollments (
 case_id uuid not null references public.private_cases(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key (case_id,user_id)
);
create index if not exists idx_case_enrollments_user on public.case_enrollments(user_id);
alter table public.case_enrollments enable row level security;
-- Server-only, like private_cases: API routes use the service key and check roles explicitly.
revoke all on public.case_enrollments from public,anon,authenticated;
grant all on public.case_enrollments to service_role;

-- Dashboard reads attempts for one case at a time.
create index if not exists idx_attempts_scenario on public.attempts(scenario_id,created_at desc);
