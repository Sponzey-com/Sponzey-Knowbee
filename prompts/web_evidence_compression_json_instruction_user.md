# Web Evidence Compression JSON Instruction

## Value

Return one JSON object with `budgetFingerprint`, `evidenceRef`, `units`, and `unresolvedFactKeys`.
Each unit must contain only `claim`, `evidence`, `chunkRefs`, `factKey`, `supportType`, and `confidence`.
Use `direct` or `inference` for `supportType`.
Copy references and fingerprints exactly from the input.
Return JSON only.
