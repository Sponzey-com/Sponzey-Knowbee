# Task Execution Brief

## Purpose

Provide the delegated child execution input envelope for a root request.

## Input

[Task Execution Brief]

This is a child execution prompt for the current root request.
Do not treat this as a fresh channel request or a direct final answer to the user.

Original user request:
{{originalRequest}}

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

{{includedContextBlocks}}

{{parentWorkOrder}}

{{selectedExecutor}}

[required_outputs]
{{requiredOutputs}}

[verification_notes]
{{verificationNotes}}

[return_to_parent_contract]
- Return a structured result to the parent/requesting agent.
- Do not send or claim the final user-channel answer yourself.
- Include status, confirmed facts, produced outputs, verification performed, unresolved items, risks, and next recommended action.
- If incomplete, include the safe alternatives already tried and the remaining alternatives the parent can choose.

[task_profile]
{{taskProfile}}

{{successCriteria}}

{{constraints}}

Preserve user-provided names, quoted strings, file names, folder names, paths, and language exactly.
Do not translate literal folder names or paths.
Write the final answer in the same language as the original user request unless the user explicitly requested translation.

{{executionInstruction}}

## Out Of Scope

- This module does not own task intake policy, routing policy, child result review policy, or final response rendering.
