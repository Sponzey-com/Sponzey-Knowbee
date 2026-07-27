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
Continue the remaining work after confirming which tools are available.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own execution failure classification, recovery key deduplication, Yeonjang availability, or final response rendering.
