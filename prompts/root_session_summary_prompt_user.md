# Root Session Summary Prompt

## Purpose

Provide the structured summary prompt used when compacting root session memory.

## Value

Return JSON only.
Schema:
{
  "what_happened": "",
  "current_goal": [],
  "still_open": [],
  "confirmed_facts": [],
  "must_keep_constraints": [],
  "artifacts_and_receipts": [],
  "tool_side_effect_boundary": [],
  "retry_do_not_repeat": [],
  "handoff_ready_context": []
}
Keep arrays concise and concrete.

## Out Of Scope

- This module does not own transcript content, model selection, fallback summaries, capsule storage, or compaction audit data.
