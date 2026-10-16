# Feedback & Results learning experience

The existing Results route now has three accessible tabs: Your Results, Investigate, and Improve. The score is the saved server score; counts come from saved match indicators. Investigation separates observations from hypotheses and never assigns a causal stage based only on a missed decision. Every record, including matched records, remains inspectable with original text, stage instructions, outputs, decisions, and recorded errors.

## Configuration and progression

`LEARNING_TARGET_ACCURACY` is a server-only setting, default 80 (valid range 1–100). Only its numeric value is passed to the client. The target is an educational benchmark, not evidence of safety, fairness, or production readiness. It does not alter scoring.

Completed full simulations determine Discover, Understand, and AI-assisted improvement phases. Stage tests and reserved-but-failed run numbers do not count. There is no three-attempt maximum. Saved attempt scores are not recomputed. Guidance never claims a prompt change caused a score difference.

After a below-target latest attempt, the next full-run API requires a saved reflection of 10–1,500 characters. Checks run before model execution and before production run reservation. Editing instructions and isolated stage testing remain available. Successful attempts do not impose this requirement. A selected historical attempt's reflection cannot satisfy the latest attempt's requirement.

The UI offers stakeholder review when the selected score meets the target. After three completed simulations, a student can acknowledge a below-target score and proceed, or keep improving. The acknowledgment is saved with the attempt. This is a learning navigation policy, not a substitute for existing API authentication and ownership protections.

## Storage and required production migration

Apply **`supabase/results-learning.sql`** after `schema.sql`, `cases.sql`, and `stakeholders.sql` before deploying this change. It adds one owner-protected `attempt_learning` table for reflections, acknowledgment, and cached optional coaching. The composite foreign key binds each row to its attempt, owner, and case. Authenticated clients can read only their own learning rows; writes remain server-only. Existing attempt rows, scores, instructions, and relationships remain intact.

The previous APIs and student-readable results JSON contained expected decisions. The new API projection removes them, and browser restoration sanitizes old local history. The migration removes grading copies from existing `attempts.results` and installs a trigger preventing their reintroduction. Original instructor answer keys remain in existing server/private case storage. Already disclosed answers cannot be made unknown to a student; applying the migration prevents continued disclosure through historical database rows. Before it is applied, deployed historical rows may still contain old expected decisions, and learning writes/read operations will report unavailable storage.

Local development uses the existing owner-scoped, four-hour server workspace, and browser history continues to use localStorage. Authenticated history and learning data use Supabase. Tab, investigation, hint, and unsaved reflection state use identity- and attempt-scoped localStorage/sessionStorage. Browser-only historic local attempts may outlive their trusted server workspace; saving/coaching then reports unavailable context. No history records are silently replaced by a new attempt.

## Optional AI coaching

`POST /api/attempt-learning` accepts only an owned case/attempt identifier and an explicit save or coach action. It resolves actual attempt data server-side. Coaching unlocks after three completed simulations, is never automatically requested, uses one real OpenAI request with bounded output, and is cached per attempt. It shares the existing 12/minute, 120/hour AI-message budget with stage tests and stakeholders. No model call is made when saved suggestions are reopened.

The coach receives public case criteria, allowed actions, stored student instructions, actual recommendations, match feedback, and bounded output excerpts for up to eight records (missed decisions first). It never receives expected decisions or private grading notes. Structured source references are validated and the server attaches the exact stored evidence excerpt. This verifies the evidence source, not the truth of an AI interpretation; suggestions are explicitly hypotheses. Optional example instructions are shown only on expansion and never replace the current draft. Missing configuration, invalid responses, rate limits, and provider failures report errors and leave non-AI guidance available.

Production requires the existing authorized session, ownership filters, and same-origin checks. The local authentication bypass remains unavailable in production. Run and grading logic are unchanged.

## Verification

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. `node tests/local-journey.cjs` uses an isolated Edge profile and real OpenAI requests: five isolated stage tests, three complete simulations (paid when demo mode is false), optional coaching, and both stakeholder openings. It checks tab keyboard navigation, investigation, hints, reflection saving, retesting, score comparison, history, refresh, privacy, mobile overflow, preserved drafts, and failure handling. Production deployment verification must additionally apply the migration and test a real signed-in Supabase account.
