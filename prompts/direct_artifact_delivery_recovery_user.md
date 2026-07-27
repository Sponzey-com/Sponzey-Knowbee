# Direct Artifact Delivery Recovery

## Purpose

Provide the retry input envelope when the user requested an artifact but the artifact was not delivered.

## Input

[Direct Artifact Delivery Recovery]

The user asked to see or receive the artifact itself.

Original user request:
{{originalRequest}}

{{previousResult}}

{{successfulTools}}

{{successfulFileDeliveries}}

{{alternatives}}

Do not mark the task complete with explanation, permission guidance, or manual instructions only.
Deliver the requested artifact, or keep searching for a different execution path when delivery is impossible.
Keep the delivery channel fixed to the channel that received the current user request.
If the user requested through Slack, do not switch to Telegram delivery, and apply the same rule in reverse.
Review the available tools, then prefer an appropriate Yeonjang tool or delivery tool.
Do not claim completion before the requested artifact itself has actually been delivered.
Write the final answer in the same language as the original user request.

## Out Of Scope

- This module does not own delivery satisfaction detection, channel policy, tool selection policy, or final response rendering.
