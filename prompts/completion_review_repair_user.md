# Completion Review Repair User Message

## Purpose

Repair one rejected completion-review response without repeating the underlying task execution.

## Out Of Scope

- This module does not execute tools, fetch data, alter evidence, deliver user-facing text, or weaken completion criteria.

## Template

Your previous completion-review JSON was rejected by the runtime contract.

Rejection reason code:

{{reasonCode}}

Return the entire completion-review object again as valid JSON only.
Preserve the original request, candidate result, and execution evidence from the preceding message.
Do not request or simulate another tool execution.
Use only exact evidence references from this allowlist:

{{allowedEvidenceRefsBlock}}

Return exactly one condition assessment for every condition in this list and use each condition ID unchanged:

{{expectedConditionsBlock}}

Return all seven required criterion assessments exactly once.
Correct the rejected contract field while keeping the substantive LLM diagnosis evidence-based.
