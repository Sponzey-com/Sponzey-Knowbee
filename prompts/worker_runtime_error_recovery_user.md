# Worker Runtime Error Recovery

## Purpose

Provide the retry input envelope when an external worker runtime failed and the request should continue on the same AI route.

## Input

[Worker Runtime Error Recovery]

The previous attempt failed while running an external worker runtime.

Original user request:
{{originalRequest}}

Recovery summary:
{{summary}}

Error analysis:
{{reason}}

{{errorDetail}}

{{failedRoute}}

{{avoidTargets}}

{{nextRouteHint}}

{{previousResult}}

Do not repeat the failed worker runtime path or any listed avoided target.
Keep the same AI connection and target unless the recovery state explicitly removed the worker runtime.
Preserve completed work and continue only the remaining work.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own worker runtime selection, process supervision, routing, error sanitization, or final response rendering.
