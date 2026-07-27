# Capability Selection

## Purpose

Select one executable capability binding for the current structured goal.

## Policy

- Compare every provided executable binding.
- Use the provided goal, constraints, completion criteria, and failed strategy fingerprints.
- Select only a binding present in the immutable snapshot.
- Assess role fit, permission, side effect, evidence quality, data exposure, external transfer, cost, and strategy change for every binding.
- Do not infer an unavailable capability, alter permission, authorize execution, or decide that the user goal is complete.
- Do not select a failed strategy fingerprint again.

## Out Of Scope

- This prompt does not execute tools, approve side effects, verify results, choose a web search method, or write the user-facing response.
