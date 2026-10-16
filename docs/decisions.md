# Case-specific decisions

Cases declare 1–20 unique action IDs in `decisions`. IDs use lowercase letters, numbers, and underscores, starting with a letter (up to 64 characters). `error` is reserved for execution failures. Action IDs are defined by the business case, not by the resume-screening sample. Existing `advance`, `reject`, and `human_review` cases and saved string decisions remain compatible.

Each private grading entry can contain either a legacy action string or a structured decision:

```json
{
  "type": "merge",
  "target_record_id": "record-2"
}
```

`merge` always requires a different, existing record ID. A missing, unknown, or self target is invalid. No target is inferred from criteria. Other actions normally have no target. Future targeted actions can declare public rules without changing runner code:

```json
{
  "decisions": ["approve", "forward"],
  "decision_rules": {
    "forward": {"requires_target": true}
  }
}
```

The private key must contain one explicit grade per record, and every grade must use a declared action. Rules cannot disable merge target validation. Rules contain only public target requirements, never expected targets or private explanations.

PDF extraction outputs structured decisions and preserves custom action meanings. It converts explicit source merge destinations to target IDs, never to rejection or another action. Source capitalization and spaces normalize to canonical IDs; custom actions such as proceed or decline are not silently remapped to resume-screening categories. An absent or ambiguous grade still requires instructor setup. A server guard blocks publication when recognizable private grading sections appear in public fields. PDFs and private drafts remain excluded from Git.

Flag always returns `{ "decision": { "type": "approve", "target_record_id": null }, "reason": "..." }`, using a strict JSON schema built from that case's allowed actions. Targeted branches allow only existing IDs other than the current record. The server validates the returned decision again. For target-aware cases, Check receives public reference records to compare evidence. Neither stage receives the answer key or private explanations.

Scoring requires an exact action and target match. A valid merge into the wrong record is a miss; a nonexistent/self/missing target is an execution error. The scoring helper recomputes correctness from the server key. Results display structured targets (for example, “Merge into record-2”). Non-targeted predictions retain string storage compatibility; merge predictions retain their structured targets. Existing JSONB storage needs no database migration, and browser localStorage history retains the structured values.

This is a decision simulation: recording a merge recommendation does not physically delete or combine source records. Each source record is scored once. The referenced record is evaluated independently. There are no new database permissions or production authentication bypasses. Stakeholder discussions keep their existing case/persona configuration; defining actions does not automatically create new stakeholder personas.
