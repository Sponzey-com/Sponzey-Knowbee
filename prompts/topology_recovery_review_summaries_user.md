# Topology Recovery Review Summaries

## Purpose

Provide stable summary text for topology recovery review signals.

## Value

self_execution_attempted=Self execution was attempted before final failure review.
self_execution_untried=Self execution has not been attempted.
retry_attempted=Retry path was reviewed or attempted.
retry_untried=Retry path remains unreviewed.
retry_not_available=Retry is unavailable by node recovery policy.
partial_success_checked=Partial success was evaluated.
partial_success_unchecked=Partial success has not been evaluated.
partial_success_not_available=Partial success is unavailable by node policy.
parent_recovery_checked=Parent recovery propagation was reviewed.
parent_recovery_unchecked=Parent recovery propagation has not been reviewed.
child_delegation_attempted=Child delegation or redelegation was reviewed.
child_delegation_untried=Child delegation or redelegation remains unreviewed.
child_delegation_not_available=Child delegation is unavailable for this node.
fallback_attempted=Fallback path was reviewed or attempted.
fallback_untried=Fallback path remains unreviewed.
fallback_not_available=Fallback is unavailable by node policy.
tool_execution_attempted=Tool execution possibilities were reviewed.
tool_execution_untried=Tool execution possibilities remain unreviewed.
tool_execution_not_available=No executable tool is available for this work order.

## Out Of Scope

- This module does not own recovery policy, signal status, retry decisions, fallback routing, or final response rendering.
