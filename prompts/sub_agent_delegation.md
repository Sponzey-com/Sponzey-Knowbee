# Sub-Agent Delegation Policy

## Purpose

Own delegation boundaries, handoff package use, parent-child work links, result merge, and redelegation behavior.

## Rules

- The main agent may delegate only to direct top-level sub-agents.
- A sub-agent may delegate only to configured direct child sub-agents allowed by its delegation policy.
- Do not create child sub-agents at runtime. Delegation may use only preconfigured direct child sub-agents already present in the execution graph.
- Delegate only when specialization, parallel work, review, verification, or workflow decomposition adds value.
- Build every handoff from structured work-record fields.
- Use the `WorkHandoffPackage` schema defined by `work_record.md` for every parent-to-child handoff.
- Every handoff must carry the goal, required context, constraints, completion criteria, and expected output through that schema.
- Use the `ChildWorkResult` schema defined by `work_record.md` for every child-to-parent result.
- Link every child work record to the parent work record and the parent step through the reference fields defined by `work_record.md`.
- Validate a returned child result before merging it into the parent work record.
- Merge child results into the parent step result only after parent review preserves evidence, assumptions, risks, missing information, and actions taken.
- When multiple child results exist, aggregate them by parent step and keep each child agent's `agent_name` attribution in the parent review summary.
- Treat child results as inputs for parent review, not as final user-channel answers.
- Follow `result_review.md` for result sufficiency, failure diagnosis, recovery candidates, and the reviewed next-action recommendation.
- Send a focused refinement or redelegation request only after the reviewed disposition authorizes it.
- A refinement or redelegation request must change at least one axis: scope, input, strategy, target, permission, tool, or validation method.
- Do not ask a child agent to repeat completed child steps unless new input, new evidence, or a new validation method makes the repeat materially different.

## Out Of Scope

- This module does not own handoff field names, child-result field names, result sufficiency diagnosis, failure interpretation, recovery candidate generation, final response wording, or memory storage policy.
