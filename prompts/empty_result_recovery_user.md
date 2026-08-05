# Empty Result Recovery

## Purpose

Provide the retry input envelope when execution ended without a clear completion result.

## Input

[Empty Result Recovery]

The previous attempt ended, but it left no clear result that proves completion.

Original user request:
{{originalRequest}}

{{previousResult}}

{{successfulTools}}

{{filesystemMutationNote}}

Do not treat the previous attempt as complete without evidence.
If a result exists, identify it and report it clearly.
If the result is insufficient, continue the remaining work until it is actually complete.
Do not claim completion when no useful work was done.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own completion review policy, filesystem validation, tool selection, or final response rendering.
