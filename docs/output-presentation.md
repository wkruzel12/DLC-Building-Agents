# Output presentation

Scenario Briefing renders the entire public `scenario.story` directly in What's Happening. Whitespace and intentional line breaks are retained; the page scrolls naturally. Case Materials and the optional source reader remain available.

`AiOutput` and `OutputSection` provide the shared reading surface for practice tests, upstream stage inputs, history, Final Review's saved practice outputs, result investigations, record traces, coaching, stakeholder assistant messages and reflection, and the legacy Workbench trace. Original records, student instructions, student messages, and transcript evidence are kept verbatim.

`presentOutput` only interprets complete JSON objects/arrays or explicitly fenced JSON. Fields become labels and values, arrays become lists, and free-form text supports paragraphs, headings, lists, and simple emphasis. No model request, summary generation, punctuation stripping, grading inference, or schema repair occurs. Quoted prose stays quoted. JSON escapes are decoded once; original responses remain available in optional closed details on test and trace surfaces. Invalid or oversized structured responses fall back to the entire original text with a neutral notice.

The presentation tree retains duplicate fields and exact numeric lexemes, including large IDs and precise decimals. Null, empty strings, empty arrays, false, and zero remain distinguishable. React escapes text; the renderer does not accept HTML or generate links from model text. Depth and node limits bound structured rendering.

Flag displays the already validated decision and explanation without repeating its serialized response. Its original response remains available. Final Review displays saved practice outputs; it does not introduce another AI stage or score. Practice execution feedback explicitly says it is not graded. Results feedback uses the recorded evaluation, and guidance uses the existing prompts and feedback.

## Verification

- `npm test`: includes focused parser and React rendering regressions for evidence, quotes, parentheses, multiline text, exact numbers, missing values, malformed data, duplicate keys, and HTML escaping.
- `npm run typecheck` and `npm run build`.
- `node tests/guided-journey.cjs`: all five tabs, complete long case text, formatted Extract/Check/Flag and saved Final Review outputs, reflection, stakeholder completion, refresh, and responsive layouts. AI and scoring responses are fixtures; no AI credits are consumed.
- `node tests/builder-journey.cjs`: practice failures/successes, stage gates, drafts, record selection, history, stale tests, full-run payload, and responsive layouts with mocked AI.

Backend calls, prompts, case schemas, answer keys, decision validation, grading, authentication, and persistence are unchanged. No deployment is part of this change.
