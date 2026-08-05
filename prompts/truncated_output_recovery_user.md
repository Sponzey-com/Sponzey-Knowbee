# Truncated Output Recovery

## Purpose

Provide the retry input envelope when code or result output was cut off or left incomplete.

## Input

[Truncated Output Recovery]

The previous attempt ended with code or result output cut off or incomplete.

Original user request:
{{originalRequest}}

{{summary}}

{{reason}}

{{remainingItems}}

{{previousResult}}

Retry the work now and finish it completely.
If a file must be written, use a local file tool or shell tool to create the final file.
Do not repeat partial code.
Do not stop in the middle of a file, tag, function, block, or sentence.
Preserve user-provided names, folder names, paths, and language exactly.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own truncation detection, filesystem validation, tool selection, or final response rendering.
