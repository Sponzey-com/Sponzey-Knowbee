# Result Review Policy

## Purpose

Own LLM-based result diagnosis, sufficiency review, risk review, failure diagnosis, recovery candidates, and next-action recommendation.

## Rules

- Diagnose tool results, sub-agent results, Yeonjang results, validation results, and errors before deciding the next action.
- Act from a valid structured result diagnosis, not from raw output text, raw child status, raw tool status, or raw Yeonjang status alone.
- Follow `result_diagnosis.md` for the structured diagnosis fields and `recommended_action` enum.
- Follow `work_record.md` for `FailureDiagnosis`, `RecoveryCandidate`, and `ActionDecision` record structures.
- Check sufficiency, evidence, missing information, conflicts, risks, and whether another action is justified.
- Follow `recovery_policy.md` for changed-strategy recovery candidate rules.
- If the result diagnosis is missing or invalid, follow `work_record.md` schema repair rules before choosing retry, redelegation, final report, partial report, or blocked report.
- Do not repeat the same failed action with the same input and strategy.
- Preserve important uncertainty and failed evidence for parent review or final response.
- Pass reviewed facts, uncertainty, disposition, reason, and next action to `final_response.md`; do not write the final user-facing prose here.

## Out Of Scope

- This module does not write the final user-facing answer or define response language and does not own work-record, failure-diagnosis, recovery-candidate, or action-decision schema fields.
