# Topology Runtime Harness Text

## Purpose

Provide prompt-owned English text for topology root runtime harness fallback and success criteria.

## Value

root_success_criterion=Produce a result that the current main agent can synthesize into the final user answer.
recovery_recommended_action=Use the current-agent fallback contract if topology execution cannot produce a final answer.
runtime_failed_summary=Topology runtime did not produce a completed result; use the current-agent fallback contract.
generic_fallback_summary=Topology runtime fallback: {{reasonCode}}.

## Out Of Scope

- This module does not own topology routing, runtime execution, persistence, fallback selection, or final response rendering.
