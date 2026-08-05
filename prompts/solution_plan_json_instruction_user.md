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

Treat structured capability constraints as authoritative. When
`approval_tool:<capability-id>` is provided and the matching capability
reference exists, include that capability for the approved side effect. Do not
substitute a different side-effect capability. Prefer a purpose-specific capability
over a generic shell or process executor that could attempt the same effect
indirectly.

Treat `requiredCapabilityRefs` as capability choices already made by prior LLM
diagnosis. Every listed reference must be selected by at least one `use_tool` or
`use_yeonjang` step. A status, discovery, or delivery capability does not replace
the required capability that produces the requested effect.

Use `capabilityOptions` as the authoritative purpose, risk, and side-effect
metadata for the provided references. When the goal requires an external effect
or artifact, select the purpose-specific effect-producing capability. A
`read_only` status or discovery capability may diagnose readiness, but it never
replaces the capability that performs the requested effect. Artifact delivery is
a separate later step and never replaces artifact creation.

Treat each `approved_capability:<capability-id>` as the exact side-effect scope
the user approved for this request. When its matching capability reference can
perform the requested effect, include it and do not replace it with an unapproved
generic side-effect capability. A materially different side effect requires its
own later approval and must not stand in for the approved effect.

Every `use_tool` or `use_yeonjang` step must include exactly one provided
`capability:` reference in `input_refs`. A validation or reporting step that does
not invoke a capability must use a non-Tool action type.

When completion requires a sequence of capabilities, create one ordered `use_tool` step for each required capability. Do not stop the plan at discovery
when a later capability is required to obtain verifiable evidence. For example,
when both canonical `web_search` and `web_fetch` references are provided and the
goal needs a sourced web fact, plan candidate discovery first and direct source
retrieval second.

## Out Of Scope

- This prompt does not authorize execution or decide whether a result satisfies the request.
