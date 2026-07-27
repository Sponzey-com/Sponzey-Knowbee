# Task Intake User Message Template

## Purpose

Own the user-message template that supplies conversation context to the task intake prompt.

## Out Of Scope

- This module does not own task intake policy, execution, delegation, recovery, memory writes, channel delivery, logging, or final response wording.

## Template

Analyze the following conversation and latest user request.

Return valid JSON only.

{{conversationContext}}
