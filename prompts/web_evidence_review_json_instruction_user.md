# Web Evidence Review JSON Instruction

## Value

Return one JSON object with `budgetFingerprint`, `evidenceSnapshotFingerprint`, `duplicateGroups`, `conflicts`, and `unresolvedFactKeys`.
Each conflict must contain only `factKey`, `unitRefs`, and `reason`.
Copy references and fingerprints exactly from the input.
Return JSON only.
