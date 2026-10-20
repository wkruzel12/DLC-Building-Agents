# UI preservation inventory

Baseline: committed application at `2e8dd3c`, compared with the uncommitted guided-lesson redesign. No API routes, case data, private grading keys, authentication, environment variables, or model configuration may change.

## Case Upload — `/`
- PDF/JSON file picker and drag/drop; extension, signature, size, count and schema checks.
- Server PDF extraction, source-only grading extraction, field-level validation feedback, loading and error messages.
- Sample case, selected file name/size/status, selected case title/count, Continue gate and original case preparation details.
- Case ownership/expiration and private-key notices, per-case drafts/history and switch confirmation.
- Presentation work: exact tab heading, current objective, concise selection layout; preserve all error details and optional technical help.

## Scenario Briefing — `/scenario`
- Three existing internal tabs: Understand Your Scenario, Explore Your Materials, Understand Your Mission.
- Per-case tab/visited state and keyboard navigation (arrows, Home, End), backward/forward actions.
- Source context/problem/assignment, role (write, test, review, improve), why AI, full source excerpts.
- Complete public materials: original context, task, requirements, records, exact IDs, full-text reader, search, filters, clear/search empty states, saved library selection and focus restoration.
- Mission, Extract/Check/Flag relationship/example, stated requirements, allowed actions, skill tags, next-step guidance and Builder handoff.
- Presentation work: restore the internal tabs removed by the earlier local simplification; retain every source field and educational instruction while using compact navigation and expandable sections.

## AI Agent Builder — `/workbench`
- Extract, Check, Flag, Final Review; per-case instructions and practice record.
- Stage objectives, source lesson/example, thinking prompts, common mistakes, input/requirements/upstream outputs, allowed actions and target-ID explanation.
- Existing character limits, real stage tests, loading/errors, signed-receipt requirements, stale-test detection, history and original structured outputs.
- Successful-test gate, backward navigation, final instruction/test summaries, existing full-case run, reflection gate, mode/cost notices and run progress.
- Existing workflow introduction must remain available as optional guidance; no new Final Review prompt or fourth model call.

## Feedback & Results — `/results`
- Your Results, Investigate, Improve internal tabs with keyboard navigation and saved view state.
- Actual accuracy/target, matched/missed/counts, attempt number/phase, processing errors and challenge-record metrics.
- Full attempt history/comparison, saved reflections, actual instruction changes and outcome differences; no causal claims from score changes.
- Every record, original text, stage instructions/outputs, decision/reason/error, inspection dialog, source criteria, stage-aware questions and hints.
- Existing per-stage improvement guidance (including missing-output counts and later-attempt hints), optional evidence-grounded coaching after three runs.
- Reflection save/validation, current/older attempt handling, target/three-run acknowledgment eligibility, Builder stage links and stakeholder handoff.
- Presentation work: keep every diagnostic and guidance block accessible in expandable sections. Final Review is a workflow checkpoint, not a separately scored model stage.

## Stakeholders — `/stakeholders`
- Existing configured personas, case-provided definitions and generated persona proposals/explicit approval.
- Names, roles, concerns, personality/priorities/concerns/questions where already supplied in proposal responses; public approved persona fields remain limited by the existing API.
- All conversations, starters, per-person drafts, attempted-run selector, send/retry/reload, restart confirmation, engagement requirement and transcript-grounded reflection.
- Actual performance metrics, agent instructions, scope/storage/mode notices and navigation to Results/Builder.
- All five formative feedback categories and transcript citations.
- Presentation work: exact Stakeholders tab/heading, accessible public profiles on mobile and desktop, compact profile selection, expandable run/feedback details. Do not invent profiles or publish server-only persona facts.

## Shared acceptance
- Five exact visible main labels: Case Upload, Scenario Briefing, AI Agent Builder, Feedback & Results, Stakeholders; same routes and eligibility rules.
- TCU design tokens, route icons, factual progress labels, keyboard focus, mobile access to every tab and no horizontal overflow.
- All existing case data and API/business logic retained; no placeholders or new dependencies.
- Verify TypeScript, production build, existing 74 tests, and browser walkthroughs using explicit AI fixtures (not substituted application screens).
- Keep changes local; do not commit, merge, push, or deploy automatically.

## Final acceptance check

| Tab / capability | Result |
| --- | --- |
| Case Upload | Exact navigation/heading retained; PDF/JSON picker, drag/drop, sample, original validation feedback, file metadata, preparation help and Continue gating remain. |
| Scenario Briefing | All three original activity tabs restored; keyboard and saved-tab behavior, complete public case, role/mission instructions, criteria, actions, skills, source search/readers and reference drawer remain. |
| AI Agent Builder | Extract, Check, Flag and Final Review retained; editors, selected record, tests, history, outputs, stale-test detection and success gates verified in browser. |
| Feedback & Results | Actual scores/counts, history/comparison, stage diagnostics, outputs, errors, hints, reflection, coaching and eligibility logic retained; expanded original guidance restored. |
| Stakeholders | Application persona data unchanged; public concerns visible on mobile, profiles/starters accessible, proposal details/approval retained, and chat/restart/engagement/reflection preserved. |
| Main navigation | All five exact labels, icons and route targets verified; completion cues limited to real validated selection/recorded-run data. |
| Shared design | Purple #4D1979, white, #F8F7FA background, #24212A / #625D69 text; consistent page names/objectives, compact internal navigation and expandable guidance. |
| Backend boundaries | No diff in API routes, src/lib, case/stakeholder data, database files, dependencies or environment configuration. |

Passed: existing 74 tests, TypeScript checks, production build, focused Builder browser regression, and full mocked browser walkthrough. Browser checks cover the five labels/headings, all briefing activities, complete source text, retained drafts/tests/record selection, original stage guidance, profile concerns, results/reflection handoff, restart/case-switch confirmation and responsive widths down to 320px. AI, score and chat responses in the walkthrough are explicitly test fixtures, not replacement application screens.

Not manually verified: production authentication, a real uploaded PDF with paid model processing, live persona generation/approval, production database persistence and assistive-technology behavior on actual devices. Existing automated tests cover the related backend contracts. No commit, merge, push or deployment was performed.

Changed files: src/app/globals.css; src/components/lab/LabShell.tsx, LearningLayout.tsx, Upload.tsx, Briefing.tsx, Builder.tsx, builder-learning.ts, Results.tsx, Stakeholders.tsx; tests/guided-journey.cjs, briefing-journey.cjs, local-journey.cjs; docs/scenario-briefing.md, student-experience.md, ui-preservation-inventory.md.
