# Instructor classroom mode

Optional. With `INSTRUCTOR_EMAILS` empty, the app works exactly as before.

## Turning it on

1. Run `supabase/classroom.sql` in the Supabase SQL Editor (after `schema.sql` and `cases.sql`).
2. In Vercel, set `INSTRUCTOR_EMAILS` to the instructors' verified TCU emails, comma-separated.
3. Instructors must sign in with a verified email (magic link). Anonymous demo sign-ins are never treated as instructors, so `DEMO_MODE` must be `false` for instructors to log in.

## What changes

- **Instructors** see an "Instructor dashboard" link in the top bar (`/instructor`). They upload a PDF or JSON case there; it is converted into a simulation and gets an 8-character join code (e.g. `K7QM-4XPA`).
- **Students** enter the join code on Case Upload instead of uploading a file. The sample case is still available. Everything after that (briefing, builder, results, stakeholders) is unchanged.
- **Dashboard** for each case: students joined, total runs, average accuracy (each student's latest run), students reaching the learning target, and a "toughest records" table showing which records the class misses most and the most common wrong answer.

## Privacy and access

- Join codes, enrollments, and answer keys stay in server-only tables (no browser access).
- The dashboard returns class-level aggregates only, not individual students' instructions or stage outputs.
- Students can open an instructor case only after joining it with its code.

## Known limits (v1)

- Local development (`npm run dev`) keeps attempts in the browser, so the dashboard and join codes only work in the deployed, signed-in environment.
- If a non-hiring case has no stakeholder personas, students cannot generate them on an instructor's case. Include two stakeholders in the case file for now.
- No per-student table or drill-down yet; those are natural next steps.
