# Completion Review User Message Template

## Purpose

Own the user-message template that supplies original request and latest result context to the completion reviewer.

## Out Of Scope

- This module does not own completion policy, execution, recovery, memory, channel delivery, logging, or final response wording.

## Template

Review whether the latest assistant result fully satisfies the original user request.

Return valid JSON only.

Original request:

{{originalRequest}}

{{priorAssistantMessagesBlock}}

Latest assistant result:

{{latestAssistantMessage}}
