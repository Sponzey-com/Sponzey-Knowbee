# Command Failure Recovery

## Purpose

Provide the retry input envelope when a local command failed and a different execution path is required.

## Input

[Command Failure Recovery]

The previous attempt failed while running a local command.

Original user request:
{{originalRequest}}

Recovery summary:
{{summary}}

Failure analysis:
{{reason}}

{{failedTools}}

{{alternatives}}

{{pathAliasHints}}

{{previousResult}}

Check the failure cause before acting.
Do not repeat the same failed command without changing the path, permission, command form, target app state, tool, or execution target.
Prefer a non-command alternative such as another Yeonjang method, another Yeonjang target, or a file tool when it can satisfy the request.
Local command fallback is not allowed.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own command failure classification, recovery key deduplication, tool availability, or final response rendering.
