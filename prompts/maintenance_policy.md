# Maintenance Policy

## Purpose

Own unused artifact cleanup, duplicate removal, structure simplicity, and deletion validation.

## Rules

- Remove unused code, prompt sources, files, configuration, documents, tests, fixtures, generated artifacts, temporary files, backup files, and UI assets after reference and retention checks.
- Keep one canonical owner for each implementation, prompt rule, schema, or document responsibility.
- Remove duplicate implementations, duplicate prompt sources, duplicate schemas, obsolete files, and temporary compatibility layers after their removal condition is met.
- Add a new file, module, adapter, or wrapper only when the responsibility cannot fit an existing canonical boundary.
- Do not add a wrapper, duplicate adapter, hidden global state, or indirect layer when the existing canonical boundary can hold the responsibility directly.
- Before deletion, check runtime references, test references, prompt registry references, migrations, user-data retention, deployment artifacts, recovery path, and validation method.
- Do not delete active user data, audit logs, migration data, or rollback data without a retention rule or explicit approval.
- Record each cleanup candidate with artifact path or id, artifact kind, current owner, cleanup reason, replacement owner when duplicated, reference-scan evidence, retention class, migration need, rollback need, validation plan, and deletion decision.
- Reference-scan evidence must include code references, test references, generated artifact references, prompt registry references, documentation references, packaging references, and runtime data references when applicable.
- Prompt cleanup must verify prompt registry membership, prompt assembly order, prompt regression ownership, active locale handling, and generated prompt artifacts before deletion.
- Generated artifact cleanup must update the source generator or synchronization script first, then regenerate or verify generated outputs.
- Compatibility layers may remain only with an owner, active caller evidence, removal condition, and validation that the compatibility path still maps to the canonical implementation.
- Duplicate removal must keep the canonical owner and either delete the duplicate or replace it with a documented migration path.
- Separate cleanup-only changes from feature behavior changes whenever practical. If both are required, complete the cleanup review before behavior changes rely on the cleaned structure.
- Do not keep tombstone files, empty wrappers, stale prompt sources, or backup copies unless a retention rule or rollback plan names their expiry condition.

## Out Of Scope

- This module does not own feature behavior, prompt wording in other modules, or UI interaction design.
