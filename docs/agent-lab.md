# Agent Lab — Workbench and Scoring

A Next.js student workbench for **Extract → Check → Flag** over five fictional resumes. Uses OpenAI's Responses API for the real agent, Supabase Auth + Postgres for login and immutable attempt records, and Vercel hosting. Includes an explicit deterministic **demo mode** (not AI) to test the entire UI without model charges.

## Setup

1. Install Node.js 20.9+ and run `npm install`.
2. Create a Supabase project and run `supabase/schema.sql` in its SQL Editor.
3. In Supabase Authentication settings, enable **Allow anonymous sign-ins**. Demo entry uses `signInAnonymously()`; the entered TCU email is unverified display metadata, never an identity or history lookup key. Keep email authentication and the `/auth/callback` route available for a future verified student sign-in flow.
4. Copy `.env.example` to `.env.local`. Add Supabase URL, publishable key, and **service role key**. Service role key MUST remain server-only, never use a `NEXT_PUBLIC_` prefix. Add `OPENAI_API_KEY` for real runs.
5. Run `npm run dev` and open http://localhost:3000. Enter a TCU email display label and click **Enter Workbench**. No email is sent.
6. Test in `DEMO_MODE=true`. This uses deterministic placeholder decisions, **but all attempts are persisted to Supabase**. Change to `DEMO_MODE=false` and ensure an OpenAI API key is set to use real AI calls. Verify the model specified by `OPENAI_MODEL` supports the Responses API and JSON-schema structured outputs.
7. Run `npm run typecheck` and `npm run build` before pushing.
8. Push the repo to GitHub. Import it in Vercel; set **the same env vars** under Project Settings → Environment Variables. Change `NEXT_PUBLIC_SITE_URL` to your live Vercel URL. Redeploy after changing env vars. Update Supabase Auth redirect allow list. Test anonymous entry, a refresh, and two runs on the live URL.

## API contract

`POST /api/run` (authenticated anonymous session when `DEMO_MODE=true`, or a verified TCU session):

```json
{"scenario_id":"resume-screener","steps":{"extract":"At least 10 characters...","check":"At least 10 characters...","flag":"At least 10 characters..."}}
```

Returns a saved attempt with `id`, `attempt_number`, `created_at`, `steps`, `results`, `planted_caught`, `planted_total`, `accuracy`, `errors`, `mode`. Each result has `item_id`, `label`, `decision`, `expected_decision`, `match`, `reason`, `outputs.extract`, `outputs.check`, `outputs.flag`, and optionally `error`. `GET /api/history` returns a user's own attempts. `GET /api/scenario` returns a public **redacted** case with no answer key or resume text.

## Data handling and limitations

- Five **fictional** resumes, two planted challenge cases. The sample answer key's interpretation is not an objective hiring truth; validate with instructors.
- All test resumes, answer-key notes, and scoring logic stay server-side. Clients do see each expected decision **after a run**, as required by the brief. This enables memorization, so do not use repeated attempts as a tamper-proof formal exam score.
- Authentication + RLS protect attempts. The server writes results with its service-role credential and the API authorizes each user first. Each run reserves capacity atomically in Supabase: 15 per rolling hour per user.
- A run invokes 3 model calls per candidate, 15 calls for the five-resume sample. No real resumes should be used without privacy, legal, and compliance review.
- Failed individual model stages return `error`, counted as incorrect; the app saves completed attempt records. A server-wide exception after reservation can consume one rate-limit slot without creating an attempt.
- Vercel function duration varies by plan; set `maxDuration` appropriately for the project or use a queue for longer or larger runs.
- Only a single bundled JSON scenario ships in this starter. Additional scenarios require adding server-side loaders, not UI hard-coding.
- The project deliberately does **not** include stakeholder chat, diagnose, portfolio, faculty access, or D2L.

## Suggested division of work

- **Jack:** `src/components/Workbench.tsx` and styling.
- **Will:** `src/lib/runner.ts` and `src/app/api/run/route.ts` (OpenAI agent and scoring).
- **Lucas:** Supabase provisioning, `supabase/schema.sql`, authentication, GitHub and Vercel settings.

Do not commit `.env.local`, API keys or Supabase service-role credentials. Protect your main branch with pull requests and review.

## Anonymous demo sessions

- Enable anonymous sign-ins in the Supabase dashboard before using instant entry. If an existing Before User Created hook requires email, adjust it to allow anonymous users for this demo project while retaining verified-email restrictions for permanent student accounts.
- The display email is user-controlled metadata. Authorization never trusts it; attempts and history use the authenticated Supabase user ID only.
- The existing `auth.uid() = user_id` SELECT policy already supports authenticated anonymous users. No policy broadening or SQL migration is required. Browser writes remain revoked; the server writes scored attempts. Review deployed policies against `supabase/schema.sql` if they differ.
- The Supabase browser session persists across refreshes. Signing out or clearing its storage loses access to that anonymous history; entering the same email on another device does not recover it.
- The 15-runs-per-rolling-hour limit is per authenticated user ID. A new anonymous identity receives a separate quota.
- In production, anonymous API access is disabled when `DEMO_MODE=false`; live runs require a verified TCU session. The auth callback remains available for a future verified sign-in UI.
## Local development without authentication

Run `npm run dev` and open http://localhost:3001. The workbench opens directly without Supabase sign-in. With `DEMO_MODE=true`, runs are simulated. With `DEMO_MODE=false` and a server-side `OPENAI_API_KEY`, runs use the real OpenAI Responses API. Local attempts are labeled LOCAL DEMO or LOCAL AI and stored in this origin's browser localStorage; both survive refreshes. No database setup is needed for this workflow.

The separate `/api/local-demo` endpoint requires `NODE_ENV=development` and a loopback request hostname. Production always returns 404 from it, even with demo mode enabled. Existing `/api/run`, `/api/history`, and `/api/scenario` retain authentication and database protections. The database's 15-runs-per-hour rule still applies to authenticated runs; local simulations do not reserve database capacity. Scenario answer-key notes and model credentials stay on the server; only scored decisions and traces are returned after a run.
## Real OpenAI runs

Set `OPENAI_MODEL=gpt-5.4-nano` and `DEMO_MODE=false` in `.env.local`, with a valid `OPENAI_API_KEY`. Restart the dev server after changing configuration. The default model supports Responses and structured outputs: https://developers.openai.com/api/docs/models/gpt-5.4-nano.

Each of the five fictional resumes follows Extract -> Check -> Flag, with each output passed to the next stage. Flag uses a strict JSON schema plus server validation for advance/reject/human_review. Answer-key notes stay server-side and are never sent to OpenAI. Scored correct decisions are returned only as part of results.

Cost controls: two resumes in flight per run; one local run at a time; 650 output tokens each for Extract and Check, 350 for Flag; 30-second request timeout; one SDK retry; 110-second total run deadline. A complete successful run uses 15 model calls with a maximum of 8,250 generated tokens before retries. Model defaults apply (nano defaults to no reasoning). Do not select a reasoning-heavy model without revisiting token limits. Rate limits, exhausted credits, missing keys, unavailable models, timeouts, incomplete outputs, and invalid decisions receive sanitized messages. Provider messages and credentials are never forwarded.

Run `node --conditions=react-server --test tests/runner.test.cjs`, `npx tsc --noEmit`, and `npm run build` to validate. Runner tests mock OpenAI and incur no API charges.
## PDF case uploads

The upload page accepts PDF and JSON files up to 1 MB. PDF bytes are sent server-side to the OpenAI Responses API for a single structured conversion call (60-second timeout, no retries, at most 10,000 output tokens). A server OPENAI_API_KEY and a PDF-capable model are required even with DEMO_MODE=true. The default gpt-5.4-nano supports this workflow. The PDF is not uploaded to the public app or stored in browser localStorage.

A PDF must contain the case context, objective, evaluation criteria, 1–20 records, and an explicit instructor grading decision per record. Conversion is instructed to extract supplied grading decisions only; incomplete cases are rejected instead of filling missing grading entries. AI extraction can still make mistakes, so structured JSON is preferred when exact grading fidelity is required. Password-protected, unreadable, malformed, and oversized PDFs receive errors. Scanned PDFs depend on the model's ability to read their page images.

The import model sees the supplied document, including its grading section, solely to structure it. The existing execution pipeline receives only record text, criteria, and student instructions; it never receives that grading key. Imported keys and notes remain in server-owned temporary storage locally, or authenticated private Supabase storage in deployment. The API returns only the public briefing. Production uploads still require authentication. Apply supabase/cases.sql before using durable deployed case uploads.