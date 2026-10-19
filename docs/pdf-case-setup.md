# Private instructor PDF setup

PDF import uses native OpenAI file input. There is no local text parser or heading regex. A completed extraction is validated with the same strict case schema as JSON uploads. Extraction failures and schema failures now have different API codes. Schema diagnostics name fields without echoing private values. No incomplete case is stored, made runnable, or returned to a student.

Alternate headings, prose, tables, and explicit per-record outcomes are supported. An explicit instructor-supplied decision is still required for every record. Criteria alone cannot establish a correct answer. Ambiguous or conflicting grades require instructor correction.

The extraction response constrains action IDs to 1–64 characters matching `^[a-z][a-z0-9_]*$`; `error` is reserved. Allowed actions come from the document, not a fixed application list. The same IDs must appear in `decisions`, rule types, and grading decisions. Normalization changes capitalization and spaces/hyphens to underscores consistently, including rule labels, but never chooses between conflicting rules or target IDs. Record references retain their exact source spelling. `merge` and actions with `requires_target: true` require an existing, different record ID; other actions must have no target. Each record needs exactly one grading entry containing a single decision. PDF diagnostics identify the field and entry with the specific reason, without echoing private grades, target values, or notes. Missing or conflicting source answers still stop import rather than being invented.

For an incomplete PDF, an instructor or trusted application operator with access to the server project can run:

```powershell
npm run case:setup -- extract "C:\path\case.pdf" .private-cases/draft.json
```

This paid extraction uses the server OpenAI settings. It writes a new file and never overwrites an existing file. Review the draft in your private editor, correcting context, criteria, and record extraction against the original PDF. Supply missing authoritative `answer_key` entries (`item_id`, `decision`, `planted`, `note`). Each record needs exactly one decision declared in the case decisions list. Merge grades require a structured decision with an explicit source target. See [case-specific decisions](decisions.md). Do not derive answers automatically. Ensure public fields contain no instructor-only grading annotations. Validate after editing:

```powershell
npm run case:setup -- validate .private-cases/draft.json
```

Upload the completed JSON through the existing authenticated upload workflow. Production authentication and case ownership checks remain in force. Full grading data is stored on the server; public case responses omit it. The setup tool is a filesystem-based instructor process, not a web editor or a new student permission. Restrict access to the project and these private files to trusted instructors/operators. On Windows, directory access inherits the containing project's ACL; POSIX mode flags alone do not restrict Windows accounts. `.private-cases/` is excluded from Git and is outside Next's `public/` directory. Do not distribute drafts or upload them to shared storage. Existing result scoring still returns the expected decision after a run as designed, but never private grading notes.

## Diagnosis and regression coverage

The previous generic message was thrown solely when `caseSchema.safeParse` failed *after* the model had completed extraction and produced valid JSON. It hid every Zod field error, so the wording did not prove that the PDF lacked grading decisions. The extraction prompt additionally required a named instructor-key/correct-decision section; it could omit explicit grades embedded in tables or record annotations. The new prompt identifies meaning and preserves source-only grades without relaxing the active schema.

Available Git history has one application commit (`75294b7`), so it cannot identify an intervening change to PDF handling. Subsequent testing of the original PDF found complete grading data but an additional, unsupported duplicate-merge outcome. The former extraction response schema forced every source outcome into three labels and could silently substitute an incorrect supported grade. The reusable decision framework now preserves custom action types and represents merges with explicit target IDs. Validation checks declared actions, complete grading coverage, and existing non-self targets. Known spelling differences are normalized deterministically; custom meanings are never substituted with resume-screening actions. See [case-specific decisions](decisions.md).

Automated mocked-provider tests cover the request contract, schema errors, missing/partial/conflicting keys, unsupported outcomes, label formatting, and extraction failures. `tests/pdf-live.cjs` exercises actual PDF extraction using a generated readable PDF and requires API credits; mock tests alone do not prove recognition of arbitrary PDFs. Original PDFs, local diagnostics, and private extracted drafts are excluded from Git.
