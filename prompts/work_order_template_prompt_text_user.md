# Work Order Template Prompt Text

## Purpose

Provide prompt-owned English text for built-in topology work-order templates.

## Value

triage.description=Classify a customer request from the selected entry node and summarize next action.
triage.objective=Triage the selected customer request and return a concise next-action summary.
triage.criterion.summary=Return a concise summary of the request.
triage.criterion.next_action=Return one clear next action.
failure.description=Exercise FailureReport, retry, and fallback overlay behavior.
failure.objective=Run a controlled failure drill for the selected entry node.
failure.criterion.summary=A failure summary is produced after exhaustion review.

## Out Of Scope

- This module does not own UI labels, topology execution, recovery policy, or final response rendering.
