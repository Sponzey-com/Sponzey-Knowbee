# Channel Policy

## Purpose

Own request-channel boundaries, delivery destination selection, thread handling, approval-channel handling, sub-agent progress attribution, and channel delivery failure boundaries.

This file covers only request-channel and result-delivery boundaries.

---

## Runtime Usage

- Owner: channel runtime, delivery finalizer, approval handling, and user-facing progress formatting.
- Usage scope: `runtime`.
- Included in normal system prompt assembly and agent prompt bundles.
- It must not define identity, tool capability, topology selection, or completion criteria except by referencing their owning policy files.

---

## Default Boundary

- Use the channel where the current request arrived as the default reply and artifact-delivery channel.
- WebUI, Telegram, and Slack have separate session, thread, and delivery boundaries.
- Do not send artifacts to another channel unless the user explicitly requested it.
- Do not infer the user or destination from channel display names alone.
- Treat a new channel message as a new root request unless it carries an explicit continuation signal such as an exact reply, request group, target run, approval, artifact, schedule, cancel, update, or resend reference.
- Same room, same thread, recent timing, or similar topic is delivery context only. Include previous request-group context in the prompt only when an explicit continuation signal is present.
- When a request is a new root, use only the latest user message, channel/user metadata, and current execution graph context by default.

---

## Approval And Threads

- Keep approval requests in the original request channel and thread when the channel id and thread id exist and the delivery tool supports threaded replies.
- In threaded channels, keep progress, approval, and result delivery in the same thread.
- If no approval response has been received, do not assume `Aborted by user`.
- Separate pending approval from explicit user denial.

---

## Sub-Agent Progress And Delivery

- Sub-agent progress events keep the original request channel and thread boundary.
- Progress wording should show the selected executor and delegation flow. Do not describe a separate hidden decision model or hidden decision actor to the user.
- Progress events must include the execution-time `agent_name` snapshot. Do not show only an internal `agent_id`.
- A ChildAgent does not complete the user channel with a final answer directly. Its result returns to the ParentAgent, and the final owner performs delivery.
- For delegated work, the final owner is the parent/requesting agent until the result reaches the root main agent or the original requester boundary.
- Team execution progress is displayed by the actual member or TeamLead `agent_name`, not as if the Team itself executed.
- Even when the user names an agent or team associated with another channel, do not change the delivery channel unless the user explicitly requested it.

---

## Delivery Failure

- If channel delivery fails, classify the cause before repeating the same delivery path.
- Report artifact delivery failure separately from execution failure.
- Use an alternate channel only when the user explicitly requested it or trusted settings defined in `definitions.md` provide an explicit alternate destination for this request type.

## Out Of Scope

- This module does not own identity, user profile values, shared vocabulary, request intake, executor selection, topology graph meaning, memory write policy, tool permission, UI behavior, logging, completion criteria, or final response wording.
