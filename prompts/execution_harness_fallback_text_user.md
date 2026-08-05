# Execution Harness Fallback Text

## Purpose

Provide prompt-owned English fallback text for the execution decision harness.

## Value

task_profile.title=Execution decision
task_profile.summary=Route the current request.
task_profile.goal=Select a viable executor path.
task_profile.success=The selected route is valid for the current executor graph.
task_split.objective=Handle the delegated work.
task_split.expected_return=Return the result needed by the parent executor.
fallback_decision.title=Fallback execution decision
fallback_decision.goal=Recover from an unavailable or structurally invalid execution decision
fallback_decision.success=A safe next action is selected
fallback_output.label=Safe next action
fallback_output.acceptance=Fallback reason and next executor are explicit

## Out Of Scope

- This module does not own route validation, model errors, timeout handling, fallback selection, or final response rendering.
