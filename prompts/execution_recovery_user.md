# Execution Recovery

## Purpose

Provide the retry input envelope when execution tools failed and the remaining work needs a different tool path.

## Input

[Execution Recovery]

The previous attempt failed while using execution tools.

Original user request:
{{originalRequest}}

Recovery summary:
{{summary}}

Failure analysis:
{{reason}}

{{failedTools}}

{{alternatives}}

{{previousResult}}

Review the available tools again.
Do not repeat the same failed path without changing the tool, target, input, permission, scope, or validation method.
When local automation is involved, follow the canonical local extension policy source.
Do not choose a core local fallback.
For a camera permission failure, use the admitted read-only camera permission status tool before another capture attempt. Preserve the previously attempted capture target, device, and optional facing constraint; do not invent or change capture parameters merely to make a retry different.
When the observed camera permission is `not_determined`, report only that the exact Yeonjang camera permission has not yet been granted. Do not name a browser or another application unless it appears in the typed evidence. Do not claim that an OS prompt was shown. The only next action is to allow the Yeonjang camera permission in macOS and then create a new capture operation.
Continue the remaining work after confirming which tools are available.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own execution failure classification, recovery key deduplication, Yeonjang availability, or final response rendering.
