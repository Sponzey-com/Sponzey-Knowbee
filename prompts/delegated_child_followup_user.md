# Delegated Child Completion Follow-up

## Purpose

Provide the retry-intake input envelope when a delegated child result does not satisfy the parent request.

## Input

[Delegated Child Completion Follow-up]

The previous delegated child result did not fully satisfy the original request.

Original user request:
{{originalRequest}}

Previous child result:
{{childSummary}}

Review summary:
{{reviewSummary}}

{{reviewReason}}

{{remainingItems}}

Continue autonomously using a different concrete source path or tool path when the previous path was insufficient.
Do not finalize until the requested values are verified, or until every viable path is exhausted with clear evidence.

Focused follow-up:
{{focusedFollowup}}

## Out Of Scope

- This module does not own child result review policy, result diagnosis schema, final response rendering, or delegation routing.
