# Phase031 Memory Governance Decision Log

## Decision 001 - Split Source Of Truth

- date: `2026-05-18`
- decision:
  - `.tasks/phase031/plan.md` remains the source of truth for the memory compaction feature design.
  - `.tasks/plan.md` remains the source of truth for governance, persistence hardening, retention, and backup policy.
- reason:
  - feature design and operational governance were diverging in scope and should not overwrite each other.

## Decision 002 - Canonical Local Backup + Tracked Mirror

- date: `2026-05-18`
- decision:
  - canonical local baseline is stored in `.tasks/Backup/phase031/`
  - repository-visible mirror is stored in `docs/phase031-memory-governance/`
- reason:
  - `.tasks/` is gitignored, so local backup alone is insufficient for repository review and later branch comparison.

## Decision 003 - Mirror Is Summary, Not Full Duplicate

- date: `2026-05-18`
- decision:
  - tracked mirror stores baseline summary, revision log, smoke evidence summary, and decision log
  - it does not attempt to reproduce every local `.tasks` document verbatim
- reason:
  - a full duplicate would be expensive to maintain and would quickly drift; summary evidence is the more stable governance surface.

## Decision 004 - Completion Requires Operational Evidence

- date: `2026-05-18`
- decision:
  - `implemented` and `auto_verified` are not sufficient for phase completion
  - `operationally_verified` requires UI / Runtime / Release smoke and evidence
- reason:
  - earlier task documents could read as “done” while real operating smoke had not yet been completed.
