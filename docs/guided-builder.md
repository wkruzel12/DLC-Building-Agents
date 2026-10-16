# Guided AI Agent Builder

The builder teaches Extract, Check, and Flag one stage at a time. Its introduction explains the workflow, each stage has a focused editor and contextual learning guide, and final review uses the existing complete simulation and scoring system. Examples use public case requirements, not grading answers. The learning assistant is a collapsible educational guide; it does not generate instructions or grade practice outputs.

## Practice tests

`POST /api/stage-test` executes exactly one stage using the shared processing functions in `src/lib/runner.ts`. Practice always uses real OpenAI processing, including when `DEMO_MODE=true`. A missing API key, invalid model, incomplete response, or provider failure returns an error, never a simulated success. Existing complete simulations retain their demo/live behavior.

Requests specify a case, an exact record ID, current instructions, stage, unique request ID, and the previous stages' signed receipts. Check receives the verified extraction and public requirements; Flag receives the verified evaluation and case-specific decision schema. Targeted decisions keep the original target-validation rules. No grading key, scoring result, or private explanation enters a practice model request or receipt.

Receipts bind successful outputs to the user/browser owner, case content, exact record, instructions, upstream test IDs, and a four-hour expiry. Altered receipts and stale or cross-user dependencies are rejected before calling OpenAI. HMAC signing uses a domain-separated key derived from the existing server-only service-role credential, or the server OpenAI credential when no service-role key is configured. Rotating the signing credential invalidates old tests. Receipts contain public evidence and student instructions; they are integrity proofs, not encrypted storage or authentication credentials.

Production requires the application's existing authorized Supabase session. Local bypass remains limited to development loopback requests. The endpoint rejects cross-origin requests, bounds request size and output tokens, limits stage concurrency to two per server instance and one per owner, and makes no automatic model retries. In-flight and short-term duplicate request IDs reuse results within an instance. Duplicate suppression is not distributed across replicas.

Tests reuse the existing durable AI-message quota: 12 requests/minute and 120/hour, shared with stakeholder generation and conversations. Production therefore needs the existing `supabase/stakeholders.sql` migration and service-role configuration. No new tables or broader database policies are needed. Practice requests do not reserve full-run attempt numbers, save scored attempts, or change the existing 15-full-runs/hour quota.

## Student progress

Instructions continue to use the existing per-case draft state. Builder navigation, selected practice record, and the last three successful tests for each stage use the same identity-scoped localStorage (local development) or sessionStorage (authenticated workspace) persistence as the current flow. They survive navigation and refresh in that browser; they do not sync between devices. Failed tests show an error and do not advance progression.

Changing instructions, choosing a different record, retesting an upstream stage, or expiring a receipt makes affected tests outdated. Earlier successful outputs remain visible as history. Each stage and final review require current successful tests. This is learning guidance in the UI, not a new security or grading boundary for the existing full-run API.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. `node tests/local-journey.cjs` is an optional Edge integration check requiring the local dev server. It makes five real stage-test requests and two complete runs, uses an isolated browser profile, and verifies progression, stale dependencies, refresh persistence, stage traces, history, responsive layouts, and failure handling. Complete runs incur OpenAI costs when demo mode is off. Screenshots are written to ignored `.test-artifacts/`.
