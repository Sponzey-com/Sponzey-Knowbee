# Node Definition Input Block

## Purpose

Render the runtime input block for node definition suggestions.

## Value

Sub-agent overview: {{userPrompt}}
Selected roles: {{selectedRoles}}
Selected styles: {{selectedStyles}}
Additional conditions: {{extraConditions}}
Current name: {{currentName}}
Current description: {{currentDescription}}
Previous sub-agents: {{incomingExecutors}}
Next sub-agents: {{outgoingExecutors}}
Target fields: {{targetFields}}
Locked fields: {{lockedFields}}
{{nameGuidanceBlock}}
{{descriptionGuidanceBlock}}
{{descriptionReviewGuidanceBlock}}

## Out Of Scope

- This module does not own topology persistence, execution routing, runtime delegation, memory writes, tool permission, channel delivery, logging, or final response wording.
