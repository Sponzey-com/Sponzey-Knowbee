# Prompt Bundle Executor Profile Projection

## Purpose

Render the executor profile projection section included in an agent prompt bundle.

## Value

Projection policy: this section is structured context for model judgment.
Runtime code must not route by scanning this text or executor names.
Selection policy: selectable executors are only direct children of the current agent.
Diagnostic executors are reference-only.
Do not select diagnostic executors without a valid connection path validated by runtime code.
Do not invent or select executor ids that are not listed under Available direct executors for current agent.
currentExecutorId: {{currentExecutorId}}
{{graphSourceLine}}

[Available direct executors for current agent]
{{selectableExecutors}}

[Diagnostic executors - not selectable here]
{{diagnosticExecutors}}

[Allowed graph edges]
{{allowedGraphEdges}}

## Out Of Scope

- This module does not own executor graph validation, route selection, runtime dispatch, permission checks, or graph repair.
