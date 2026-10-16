# Stakeholder conversations

The fifth stage at /stakeholders uses live OpenAI Responses calls, including when DEMO_MODE=true. Results -> Continue to Stakeholder Review selects the most recent completed attempt for the current case; the review's attempt selector can reopen older attempts without sharing their conversations.

## Source and configuration

AI Stakeholders__DLC Simulation.docx was not found in the workspace. stakeholders/resume-screener.json implements the fallback specifications supplied with this feature request. Sarah and Zack's roles, facts, concerns, personalities, reference questions, and public starter prompts are server-owned structured data. No company facts come from React. Stakeholder configurations now belong to each case, stored in its server-only scenario JSON. There is no scenario-ID allowlist. Uploaded hiring/resume-screening cases without definitions can associate Sarah and Zack based on the actual brief; imported cases receive generic role priorities and no unrelated template company facts. Explicit case-file personas take precedence. Exactly two personas with unique validated IDs are supported by the current two-perspective review.

Persona facts belong to the fictional recruiting exercise, not all uploaded cases or real employers. Zack is instructed to treat the four-fifths rule as a screening heuristic, not proof of compliance, and to avoid universal claims about jurisdiction-dependent requirements. This is an educational roleplay, not legal advice.

## Trusted context and persistence

Production requires an authenticated, authorized TCU user before any conversation read or live request. The server resolves the owned case and retrieves the attempt by authenticated user_id, case ID, and attempt ID. Scores, personas, histories, and grading keys supplied by the browser are not accepted. The prompt includes the selected attempt?s actual sample size, instructions, metrics, matched/missed decision counts, explanations, and bounded Extract/Check/Flag excerpts. Expected grading decisions, hidden grading notes, service keys, and API keys are excluded from model packets. Sample figures are never extrapolated to an assumed full population.

Local development remains loopback-only and bypasses Supabase authentication. Each new local agent run now stores a trusted server-generated snapshot in an OS temporary directory, scoped by the existing HTTP-only case-owner cookie. Older browser-only attempts cannot establish authoritative scores: rerun the agent to review them. Browser attempt history is preserved; only the review eligibility window differs. Local snapshots and reviews expire four hours after workspace creation, retain the most recent 20 trusted attempts, and are opportunistically cleaned on access. At most 100 live local workspaces are stored. This is a single-process development prototype; OS temp cleanup, a lost cookie, or expiry removes review access. Production cannot enable this path through DEMO_MODE or any client flag.

Transcripts are stored on the server, not trusted from localStorage. The browser stores only draft text and selected persona per case and attempt (localStorage in development, account-scoped sessionStorage in production). Reloading retrieves authorized server transcripts. Every configured stakeholder has an independent conversation ID. Restart requires explicit confirmation, generates a new conversation ID, preserves the other persona, and invalidates reflection. Each attempt has a separate review. Returning to an earlier attempt retrieves its prior discussion.

## Deploy

Apply supabase/schema.sql, supabase/cases.sql for uploaded cases, and supabase/stakeholders.sql. The new migration adds stakeholder_reviews, a composite ownership/case foreign key to attempts, SELECT-only owner RLS, server-only transcript writes, and an atomic per-user request-budget RPC granted only to service_role. Configure the existing server-side Supabase service key and OPENAI_API_KEY. No additional public secret environment variables are used. Applying these SQL migrations to the live database is a deployment step; the local code build does not apply them. Schedule retention cleanup for abandoned production reservation rows and set an institutional transcript-retention policy before real deployment.

## Cost, memory, and failure controls

The configured OPENAI_MODEL is reused (default gpt-5.4-nano). Stakeholder replies use at most 700 output tokens; generation uses 2,200; reflection uses at most 3,000. Calls have a 35-second timeout and no automatic SDK retries. Context contains the most recent 12 messages, clipped to 2,000 characters per message, plus a bounded server performance packet. The full transcript remains visible, but older context is not guaranteed in model memory. Each stakeholder is capped at 30 student turns before an explicit restart. Reflection uses the most recent 20 messages from each persona.

All model-generating actions (generation, openings, sends, restarts, reflection, and failed requests) reserve budget: 12 requests per rolling minute and 120 per hour per user/browser owner. A persisted 60-second review lease prevents simultaneous writes across tabs (atomic SQL conditional updates in production), and request UUIDs make successful send retries idempotent. A failed model request does not append a partial exchange. Safe user-facing errors do not forward provider bodies. Reviews support explicit retry and reload. Use synthetic cases and messages in development.

## Reflection

Finish Stakeholder Review unlocks only after a student message and subsequent AI reply with both stakeholders. Feedback is labeled formative, not a grade or definitive assessment. It includes concerns from the first and second configured perspectives, student responses, evidence gaps, and improvements. The model selects short message references from role-specific schema enums. The server resolves them to real message IDs and attaches exact saved-message excerpts; it does not trust model-written quotations. The server rejects nonexistent IDs, altered quotes, or misattributed stakeholder/student evidence. These citations substantiate the transcript source, not the objective truth of a student's claim. Reflection is cached until either conversation changes.

## Checks

Run npx tsc --noEmit, npm test, and npm run build. Unit tests mock OpenAI and Supabase and incur no model charges. A live HTTP smoke test can exercise a fresh agent run, both personas, persistence, reflection, and owner rejection without launching Edge or altering browser history.
## Uploaded and generated stakeholders

JSON case files may include a stakeholders array with two definitions. Minimal example (names are fictional):

```json
"stakeholders": [
  {"id":"operations","name":"Maya Chen","role":"Operations Manager","concern":"Workflow practicality"},
  {"id":"customer","name":"Leo Rivera","role":"Customer Service Lead","concern":"Customer impact"}
]
```

Optional fields: personality, priorities, concerns, facts, challenge_questions, starters, initials. Unknown instruction fields are rejected. Facts must be explicit case-supplied claims; never place grading answers or private solution notes in persona fields. PDF extraction retains two explicitly supplied stakeholder definitions; it does not generate missing personas during upload.

For cases without suitable supplied or hiring-template personas, the review page offers Generate Stakeholders. This explicit server-side call proposes two relevant fictional roles using only title, context, task, and requirements, with no grading data or attempt metrics. Generated definitions cannot supply a facts field. Their names, characteristics, priorities, and questions are proposed simulation content, not verified company information. The user reviews both cards and selects Approve Stakeholders & Begin. No conversations are created or sent to these personas before approval. Declining to approve leaves the proposal inactive; an instructor may instead supply their own definitions in a new case upload.

Configurations retain source, status, and a random proposal ID. Approval accepts only the stored proposal ID, not client-submitted persona text. Owner-filtered conditional updates prevent cross-case approval or replacement of an approved configuration. The configuration persists with the case and is reused across its attempts, while conversations remain per attempt and persona. Existing case and transcript JSONB columns support the update without a new database migration or wider grants. Local cases retain their original expiry; changing stakeholder setup does not extend it.
