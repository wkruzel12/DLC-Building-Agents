# DLC-Building-Agents

Agent Lab is a Next.js learning workspace for case uploads, AI workflow design, evaluation, and stakeholder conversations.

## Run locally

Install dependencies with `npm install`, configure server credentials in `.env.local` using `.env.example`, then run `npm run dev` and open http://localhost:3001. Local development bypasses sign-in; production APIs require authentication. Never commit local credentials or student history.

## Documentation

- [Application setup and PDF uploads](docs/agent-lab.md)
- [Stakeholder conversations, limits, source, and deployment](docs/stakeholders.md)

Apply `supabase/schema.sql`, `supabase/cases.sql`, and `supabase/stakeholders.sql` for authenticated production persistence. Stakeholder personas currently use the supplied fallback specifications because the authoritative DOCX was not available.

## Validation

Run `npx tsc --noEmit`, `node --conditions=react-server --test tests/runner.test.cjs tests/cases.test.cjs tests/pdf-case.test.cjs tests/stakeholders.test.cjs`, and `npm run build`. The tests mock external APIs. Optional `tests/stakeholder-live.cjs` performs a paid live smoke test with synthetic data against a running development server.