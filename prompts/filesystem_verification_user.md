# Filesystem Verification

## Purpose

Provide input for checking whether filesystem mutation evidence exists.

## Input

[Filesystem Verification]

Original user request:
{{originalRequest}}

{{mutationPathsBlock}}

## Rules

- Verify concrete filesystem evidence for the requested mutation.
- Treat listed mutation paths as the primary verification candidates.
- If no mutation paths are listed, infer candidates only from the original request and trusted work directory.
- Report verified evidence separately from missing evidence.
- Do not claim a file or folder exists without direct filesystem evidence.

## Out Of Scope

- This module does not own filesystem mutation execution, recovery delegation, or final response rendering.
