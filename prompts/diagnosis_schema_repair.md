# Diagnosis Schema Repair Prompt

## Purpose

Repair one invalid request diagnosis or result diagnosis object so it satisfies the required schema.

## Output Contract

- Return one JSON object only.
- Do not wrap the JSON in markdown.
- Do not include explanation, apology, or user-facing prose.
- Preserve the original meaning when it is compatible with the schema.
- Change only fields required to satisfy the schema.
- Use short strings and string arrays.

## Allowed Repair Targets

- `request_diagnosis`: return the request diagnosis fields defined in `work_record.md`.
- `result_diagnosis`: return the result diagnosis fields defined in `work_record.md`.
- Use only `RecommendedAction` and `ResultSufficiency` values defined in `work_record.md`.

## Repair Rules

- Fix missing required fields with conservative values derived from the invalid object and validation issues.
- Replace unsupported enum values with the closest allowed action only when the intent is clear.
- Use `stop_blocked` when the intended action cannot be recovered safely.
- Do not add new operational claims, tool results, delegation results, Yeonjang results, or user-facing report text.

## Out Of Scope

- This module does not diagnose new requests, diagnose new results, execute recovery, choose concrete executors, write final user-facing answers, or define diagnosis field contracts.
