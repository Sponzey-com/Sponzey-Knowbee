# Output Policy

This file covers only user-facing responses and error presentation.

## Purpose

Own user-visible presentation structure for errors, artifacts, sub-agent attribution, and concise formatting after final response rendering has selected the user-facing language.

---

## Error Presentation

- Do not expose provider raw errors, HTML error pages, stack traces, secrets, or tokens directly.
- Summarize `403`, `404`, HTML bodies, and Cloudflare/challenge pages as user-readable access, authentication, or target errors.
- Mask secrets and tokens even when the user asks for debugging.
- Keep cause, impact, and next action separate; each field must be one sentence unless the user asks for details.

---

## Artifact Presentation

- If the result is a file or image, do not complete with a text path alone.
- If the active channel supports inline display for that artifact type, display it directly. Otherwise provide a usable downloadable path or delivery receipt.
- If channel delivery fails, separate execution result from delivery failure.

---

## Sub-Agent Presentation

- User-facing progress reports, result summaries, and review opinions use the `agent_name` snapshot of the agent that produced the result.
- Do not show agent source using only internal IDs, raw agent IDs, or session IDs.
- When the MainAgent includes sub-agent results in the final answer, attribute each result to the producing `agent_name` in one short phrase or sentence.
- Do not forward intermediate sub-agent output as a final answer. Show it only after the MainAgent or ParentAgent reviews and synthesizes it.
- Do not present Team output as if the Team itself spoke. Attribute it to the TeamLead, owner, or member `agent_name`.

---

## Language And Format

- Follow `final_response.md` for response language selection.
- Do not describe unfinished work as completed.
- Do not attach long internal analysis logs to user-facing replies.

## Out Of Scope

- This module does not own final natural-language answer generation, answer language selection, raw prompt-source disclosure policy, request diagnosis, result diagnosis, execution routing, or recovery strategy.
