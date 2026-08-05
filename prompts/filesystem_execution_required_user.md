# Filesystem Execution Required

## Purpose

Provide the retry input envelope when the user request requires an actual local file or folder mutation.

## Input

[Filesystem Execution Required]

The original user request requires a real local file or folder change.

Original user request:
{{originalRequest}}

{{previousResult}}

The requested file or folder must be created or modified in the local environment before the task is complete.
Use an available file tool or shell tool to perform the local work.
Do not complete the task with manual guidance, example code, or explanation only.
Do not claim completion without a real file or folder mutation.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own filesystem mutation detection, file tool policy, shell tool policy, or final response rendering.
