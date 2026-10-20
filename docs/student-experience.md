# Guided student experience

## Journey audit

| Route | Existing responsibility | UX change |
| --- | --- | --- |
| `/` | Authenticated case selection, PDF/JSON import, sample case | Two clear ways to begin; a validated selection exposes one Continue action. Changing cases keeps per-case drafts. |
| `/scenario` | Public context, assignment, criteria, source materials, learning objectives | All three original briefing activities remain as compact tabs. Full source text, search, filters, allowed actions, skill tags, and every original educational explanation stay available. View Full Case opens the shared reference drawer. |
| `/workbench` | Extract → Check → Flag → Final Review; signed practice tests; full simulation | One activity at a time, purpose sentence, optional help, visible prerequisites, clear Back/Continue, and practice evidence in Final Review. |
| `/results` | Actual scores, evidence inspection, attempt history, reflection, improvement and stakeholder eligibility | A compact result summary and next action. Evidence and reflection stay in separate activities; coaching and stage prompts are optional. |
| `/stakeholders` | Two conversations, explicit persona approval when needed, verified engagement, formative reflection | Two compact stakeholder choices, one conversation, optional performance details, and a completed-review summary grounded in recorded attempts. |

The previous interface repeated orientation text in the sidebar, briefing tabs, stage cards, and results panels. The three briefing activities now use compact internal tabs and expandable explanations while preserving their original content. The stakeholder page combined participant selection, chat, and a permanent performance dashboard. The redesign uses a shared horizontal route indicator, a focused content column, optional supporting details, and one primary action for the current task.

## Layout and progress

`LabShell` retains the five exact main labels and routes: Case Upload, Scenario Briefing, AI Agent Builder, Feedback & Results, and Stakeholders. Each has an icon and current-tab state. A check mark appears only for a validated case selection or a recorded full run, with factual labels (Case ready / Run complete). Tab visits, access eligibility, and the current route are not treated as proof that a student completed the learning activity. The final completion message appears only after the existing stakeholder reflection response exists; new discussion/restart continues to invalidate it through the existing service.

`LearningLayout` provides shared lesson headings, optional help, navigation, and a recorded-attempt summary. Comparisons use available prior attempts and explicitly avoid claiming that an instruction edit caused a score change. Practice tests remain ungraded. A full run's instructions may differ from the current draft; summaries label which version they describe.

All three original briefing tabs remain freely navigable and keep their existing per-case selection/visited state. No evaluation prerequisite was added or removed. Starting/continuing the Builder preserves its view, record selection, instructions, receipts, and attempts. The existing materials storage key remains compatible. No authoritative completion-time estimate is available, so none is shown.

## Functional boundaries

Authentication and identity-scoped draft persistence stay in `FlowProvider`. UI text does not promise successful storage when it cannot verify it. A failed practice test says the instructions are unchanged. Browser-storage errors continue to surface through the existing provider. Restarting a conversation keeps the existing explicit confirmation. Choosing another case after starting work now asks for confirmation before uploading or changing the selection; canceling leaves the current selection and work intact. Ordinary backward navigation does not discard work and needs no discard prompt.

No API routes, extraction prompts, case validators, scoring functions, receipt verification, reflection rules, ownership checks, model settings, environment variables, or production configuration are changed. The existing target and three-run acknowledgment rule still control stakeholder access. Below-target runs still require a saved reflection before another full run. Full source case criteria and original record IDs remain unchanged. New helpers use only public case content, student instructions, recorded outputs, public match indicators, and saved student reflections; they never use a private grading key.

## Changed files

- `src/components/lab/LabShell.tsx`: shared horizontal route progress and prerequisite explanations.
- `src/components/lab/LearningLayout.tsx`: reusable lesson frame, help, navigation, and recorded-attempt summary.
- `src/components/lab/Upload.tsx`: simpler case choice and a clear validated-case handoff.
- `src/components/lab/Briefing.tsx`: all original briefing tabs, compact source summaries, preserved educational explanations, and a full public case drawer.
- `src/components/lab/Builder.tsx` and `builder-learning.ts`: purpose, clearer copy, backward navigation, test feedback, and review evidence.
- `src/components/lab/Results.tsx`: compact actual-result summary, optional guidance, and unchanged improvement/eligibility actions.
- `src/components/lab/Stakeholders.tsx`: focused conversations, optional performance details, completion summary, and accessible selection/dialogs.
- `src/app/globals.css`: shared lesson, progress, responsive, and accessible interaction styling.
- `tests/guided-journey.cjs`: full mocked browser walkthrough.
- `tests/briefing-journey.cjs` and `tests/local-journey.cjs`: existing optional live checks adapted to the overview navigation.
- `docs/scenario-briefing.md`, `docs/ui-preservation-inventory.md`, and this document: updated workflow, preservation inventory, acceptance checklist, and verification notes.

## Checks

- `npm test`: existing backend, privacy, PDF validation, scoring, practice receipt, persistence, and stakeholder tests.
- `npm run typecheck` and `npm run build`: compile-time and production-build checks.
- `LAB_TEST_URL=http://127.0.0.1:3002 node tests/guided-journey.cjs`: optional headless Edge walkthrough of the full redesigned journey using explicitly mocked AI/scoring/chat fixtures, including backward navigation, refresh, prerequisites, keyboard details, and desktop/tablet/mobile layouts. No AI credits or production actions.
- `tests/builder-journey.cjs`: focused mocked regression check for all four Builder activities, failed tests, history, stale dependencies, and record changes.
- The optional live browser scripts retain real-provider coverage and incur credits; mocks do not establish live model quality.

Before release, manually check authenticated sign-in/sign-out, a real instructor PDF and paid AI run, production persistence, persona approval for a custom case, and screen-reader announcements on supported devices. Nothing in this task automatically commits, merges, pushes, or deploys the redesign.
