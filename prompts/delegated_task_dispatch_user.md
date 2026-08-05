# Delegated Task Dispatch

## Purpose

Append a concrete delegated task handoff to an already rendered agent prompt.

## Input

{{renderedPrompt}}

# Delegated task

Task ID: {{taskId}}
Goal: {{goal}}
Action: {{actionType}}

# Original user request
{{originalRequest}}

# Expected outputs
{{expectedOutputs}}

# Constraints
{{constraints}}

## Rules

- Use this handoff as the active task scope.
- Return concrete results for the expected outputs.
- Stay within the listed constraints.

## Out Of Scope

- This module does not own sub-agent base policy, response language policy, or final response rendering.
