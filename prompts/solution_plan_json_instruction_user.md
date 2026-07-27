# Solution Plan Response Tool Instruction

## Purpose

Provide the required response-tool instruction for the LLM solution-plan adapter.

## Value

Call `submit_solution_plan` exactly once. Put the complete `LlmSolutionPlanPayload`
in its tool input. Do not emit plain JSON, Markdown, or explanatory prose.

Required top-level fields:
- `ownerAgentName`: copy the provided owner agent name exactly.
- `steps`: a non-empty ordered array.

Each step must contain `step_id`, `owner_agent_name`, `action_type`, `input_refs`, `expected_output`, `completion_criteria`, and `status`.
Use only the provided capabilities and constraints. Set every new step status to
`pending`. The response-tool schema is the sole output-shape authority.

When completion requires a sequence of capabilities, create one ordered `use_tool` step for each required capability. Do not stop the plan at discovery
when a later capability is required to obtain verifiable evidence. For example,
when both canonical `web_search` and `web_fetch` references are provided and the
goal needs a sourced web fact, plan candidate discovery first and direct source
retrieval second.

## Out Of Scope

- This prompt does not authorize execution or decide whether a result satisfies the request.
