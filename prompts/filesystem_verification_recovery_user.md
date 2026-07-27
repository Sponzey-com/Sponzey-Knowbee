# Filesystem Verification Recovery

## Purpose

Provide the retry input envelope when an actual file or folder result could not be verified.

## Input

[Filesystem Verification Recovery]

The previous attempt could not automatically verify the actual file or folder result.

Original user request:
{{originalRequest}}

Verification summary:
{{verificationSummary}}

{{verificationReason}}

{{targetPaths}}

{{missingItems}}

{{previousResult}}

Use a real file tool or local command to verify whether the target path exists.
If the target does not exist, create or modify it through another concrete path.
If the target already exists, find the real path again and capture verification evidence.
Do not claim completion before checking actual existence again.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own verification policy, file tool policy, shell tool policy, or final response rendering.
