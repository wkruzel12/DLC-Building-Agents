# Agent Lab visual identity and writing guidance

The visual reference was [Accenture Insights](https://www.accenture.com/en/insights). This implementation uses general editorial principles: dark framing, confident typography, purple accents, and clear light reading surfaces. It does not reuse Accenture's logo, imagery, proprietary fonts, written content, or page composition. The existing Agent Lab symbol and system fonts remain.

## Files for this presentation update

- `src/app/agent-theme.css`: isolated Agent Lab theme tokens and responsive styles across all five tabs, auth entry, dialogs, source documents, inputs, scores, and chat. It loads after the existing application styles.
- `src/app/layout.tsx`: imports the theme stylesheet.
- `src/components/lab/LabShell.tsx`: theme class and a sentence-case journey caption. The five labels, routes, access gates, and navigation handlers stay intact.
- `src/lib/combined-builder.ts`: presentation metadata only: each input's question, complete requested description, practical guidance, and illustrative placeholder. Its assembly, validation, readiness orchestration, and grade guard are unchanged by this visual update.
- `src/components/lab/Builder.tsx`: renders the added guidance, two-digit accents, and accessible description references. All three writing areas stay on one page; the review/testing/results workflow is unchanged.
- `tests/guided-journey.cjs`: rendered contrast/focus checks and guidance accessibility checks alongside the existing five-tab regression journey.
- This document records the design and verification scope.

Earlier uncommitted work implements the combined builder and briefing organization. This update preserves it; those existing modifications are not discarded or replaced.

## Design

The header and navigation use charcoal `#151019`; page headers use `#221728`. Primary actions use electric purple `#A100FF`, with a darker accessible purple for text. Long-form reading, original records, input fields, and evidence stay on white or `#F7F5F9`. Source line breaks, lists, and complete record contents remain unchanged. Cards have restrained borders and small corners; typography and spacing provide hierarchy.

The responsive navigation retains every main label at narrow widths. The authenticated header can wrap its session label and sign-out control. The materials drawer uses a flexible body so a longer title does not hide source content. Inputs have explicit labels and references to their question, explanation, and guidance. Focus indicators adapt to dark and light surfaces. Reduced-motion preferences disable decorative transitions and minimize the existing functional spinner.

## Guidance

Look For helps students identify relevant information. Verify explains checking evidence and case-supplied dates, metrics, or thresholds without adding new criteria. Don't Include distinguishes ignored information, unsupported credit, review flags, and case-supported exclusion; it explicitly says a review flag is not automatic rejection. Examples remain placeholders in blank fields and are not inserted into drafts or prompts. Authored text and grading results remain separate.

## Verification and limits

- `npm test`, `npm run typecheck`, and `npm run build`.
- `node tests/guided-journey.cjs`: all five tabs, signed readiness sequence, graded fixtures, evidence, reflection, stakeholders, saved state, and responsive widths. Browser-computed contrasts for header branding, hero title/description, primary button colors, and locked navigation must be at least 4.5:1. Focus visibility, all guidance description references, a 320px authenticated-header layout fixture, and reduced-motion behavior are checked.
- `node tests/builder-journey.cjs`: sample and uploaded cases, exact review text, empty fields, readiness failures, partial/invalid grades, iteration, history, changed records, longer drafts, and tablet/mobile layouts.
- `node tests/briefing-journey.cjs`: complete Context/Objective/Criteria, ten uploaded records, source privacy, material readers, keyboard focus, mobile drawer, and draft preservation.

Browser AI and grading responses are mocked for this presentation work; these checks do not establish live-model quality or test an external production sign-in. Existing automated backend tests cover authentication/ownership boundaries, schema validation, decision targets, grading, and stakeholder persistence. No database migrations, dependencies, model prompts, API handlers, private keys, or grading rules are changed by the visual update. No commit, push, merge, or deployment is part of it.
