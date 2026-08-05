# Approval Granted Continuation

## Purpose

Provide the continuation input envelope after the user approves a previously requested local action.

## Input

[Approval Granted Continuation]

The user approved the local action requested earlier.

Original user request:
{{originalRequest}}

Previous approval request response:
{{approvalPreview}}

Approved action:
{{toolName}}

Continue the actual work now.
Do not repeat the same approval request.
Do not return explanation or manual instructions instead of performing the approved work.
Use an available approved tool path to execute and finish the approved work.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own approval policy, tool permission policy, channel approval UI, or final response rendering.
