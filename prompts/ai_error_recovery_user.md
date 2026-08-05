# AI Error Recovery

## Purpose

Provide the retry input envelope when an AI call failed and the request should continue on the same AI route.

## Input

[AI Error Recovery]

The previous attempt failed during an AI call.

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

Do not repeat the failed approach or any listed avoided target.
Keep the same AI connection and target.
Do not switch provider or model inside this recovery input.
Change only the strategy, such as a shorter response, simpler step split, or different tool combination.
Preserve completed work and continue only the remaining work.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own provider routing, credential handling, model selection, error sanitization, or final response rendering.
