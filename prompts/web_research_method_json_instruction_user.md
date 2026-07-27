# Web Research Method JSON Instruction

## Purpose

Define the JSON output for one web research method proposal.

## Value

Return one JSON object only.
For search, return `kind`, `candidateId`, `query`, and `strategyFingerprint`.
For fetch, return `kind`, `candidateId`, `sourceUrl`, `evidenceRef`, and `strategyFingerprint`.
For completion, return `kind` and `evidenceRefs`.
For blocked, return `kind`, `evidenceRefs`, and `reasonCode`.
Use exactly one of `execute_search`, `execute_fetch`, `propose_complete`, or `propose_blocked`.
Copy every candidate and evidence value exactly from the input snapshot.

## Out Of Scope

- This instruction defines serialization only. It does not authorize execution or a terminal state.
