# Structured Execution Brief

## Purpose

Provide the execution input envelope for a root or scheduled task after intake.

## Input

{{header}}

{{introLines}}

{{originalRequestBlock}}

[target]
{{target}}

[to]
{{destination}}

{{contextBlock}}

{{normalizedEnglishBlock}}

[complete-condition]
{{completeConditions}}

[checklist]
{{checklist}}

{{extraSections}}

{{closingLines}}

## Rules

- Treat this brief as the current execution input.
- Perform the requested real work instead of creating another intake receipt.
- Preserve user-provided names, quoted strings, file names, folder names, and paths exactly.
- Do not translate literal paths or folder names.
- Follow the canonical final response policy for answer language.

## Out Of Scope

- This module does not own task intake policy, routing policy, result review, or final response rendering.
