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

## Create case (guided builder)

`/instructor/new`, the "Create case" tab, walks instructors through six steps:

1. **Materials:** upload a syllabus or assignment (PDF or plain text, up to 4 files and 4 MB) or paste text. AI reads them and suggests the course details, learning outcomes, course skills, AI skills, and settings. Files are sent to OpenAI for reading and are not stored.
2. **Learning outcomes:** confirm, edit, or add outcomes. Generation uses confirmed outcomes only.
3. **Skills:** up to six AI skills (each becomes a planted-record idea) and course-specific skills.
4. **Case design:** setting, scenario idea, source facts or policies for complex cases, record count (3–20), detail level, difficulty, planted records, allowed actions (presets or custom, including targeted actions like merge), questions students must address, and prompting requirements.
5. **Rubric:** grading emphasis and private grading notes.
6. **Review and publish:** AI drafts the full case (context, criteria, records, private answer key with notes, two stakeholders). The instructor edits everything record by record, sees automatic checks and a student preview, confirms the answer key, and publishes to get a join code. **Download JSON** saves a copy that can be re-uploaded later.

Implementation notes:
- The builder edits a case record by record, and `toScenario()` converts it into the existing case format validated by `caseSchema`. Publishing uses the same storage and join codes as uploaded cases.
- Questions and prompting requirements are appended to the student-facing task. The runner never reads the task, so scoring is unaffected.
- Builder metadata (outcomes, skills, rubric) is stored in the case's private `rubric` field and never sent to students.
- The same safeguard as PDF import blocks grading language (such as "answer key") in student-facing text.
- Drafts are saved in the instructor's browser until published.
- Set `OPENAI_CASE_MODEL` to use a stronger model for case generation only. Otherwise `OPENAI_MODEL` is used.

## Proofwork Guide

A chat assistant available on every instructor page (bottom right). It explains the interface, interprets the selected case's class results, and reviews the draft being built. It sees:
- **Dashboard:** the selected case (including its answer key and notes, since the instructor owns it) and class totals.
- **Create case:** a size-capped summary of the current draft.

It never sees individual students' work and cannot change anything. Limits: 40 questions per instructor per hour, plus 10 material reads and 8 generations per hour (best-effort, per server instance).

## Privacy and access

- Join codes, enrollments, and answer keys stay in server-only tables (no browser access).
- The dashboard returns class-level aggregates only, not individual students' instructions or stage outputs.
- Students can open an instructor case only after joining it with its code.

## Known limits (v1)

- Local development (`npm run dev`) keeps attempts in the browser, so the dashboard and join codes only work in the deployed, signed-in environment.
- Uploaded non-hiring cases without stakeholder personas can't use stakeholder conversations. Cases made with the builder include two stakeholders.
- Instructor pages and AI routes require the signed-in deployment; they are not available in local development.
- No per-student table or drill-down yet; those are natural next steps.
