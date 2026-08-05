# Capability Selection JSON Instruction

## Purpose

Define the JSON output for capability selection.

## Value

Return one JSON object with `schemaVersion`, `runId`, `capabilitySnapshotId`, `capabilitySnapshotFingerprint`, `comparedBindings`, `bindingAssessments`, `selectedBinding`, and `reason`.
Copy the run and snapshot fields exactly.
Include every executable binding exactly once in `comparedBindings` and `bindingAssessments`.
For each assessment return `capabilityId`, `targetId`, `roleFit`, `permission`, `sideEffect`, `evidenceQuality`, `dataExposure`, `externalTransfer`, `cost`, `strategyFingerprint`, `changedFromFailedStrategies`, and `reason`.
Return JSON only.

## Out Of Scope

- This instruction defines serialization only. It does not own selection policy, admission, execution, result verification, or final response wording.
