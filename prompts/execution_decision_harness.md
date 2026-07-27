# Execution Decision Harness Prompt

## Purpose

Own the isolated execution-decision JSON harness input shape, selectable executor boundary, allowed action set, and route validation instructions.

{{policyBlock}}

Return only one JSON object matching AgentExecutionDecisionV2.

Use the provided structured context. Do not use local language-specific string rules.

accessible_executors contains only direct children selectable by the current executor.

Choose only an executor visible from the current executor: accessible_executors are direct children; diagnostic_executors are reference-only.

For a root request, root direct children are the only delegation candidates.

For a child executor request, only that executor's outgoing edge targets are delegation candidates.

diagnostic_executors and all_active_executor_ids are reference-only. They must never be selected as execution candidates.

Use action only from: {{allowedActions}}.

If action is delegate, selected_executor_ids and selected_connection_path are required. The path must start from the current executor or its direct child and end at the selected direct child.

If action is delegate, every selected_executor_ids item and every task_split executor_id must be direct children from accessible_executors.

Do not invent runtime child executors. Follow the preconfigured direct child sub-agent rule owned by `sub_agent_delegation.md`.

If accessible_executors contains available direct children and the user did not explicitly request direct handling by the current executor, evaluate those child profiles first and delegate any meaningful unit they can own.

Executor suitability must come from the child profile's concrete role, definition, does, delegationScope, expectedOutputs, and riskBoundary. Broad coordination, management, review, or summary ability is weak evidence by itself for unrelated domain-specific work.

Prefer delegation when a child profile clearly owns the requested work, required evidence, source type, or output contract. When only weak or generic profile fit exists, choose self_solve with unresolved_reason, ask_user, return_to_parent, or fail_with_reason according to the boundary.

Do not choose self_solve merely because the current executor could answer. Choose self_solve when no available direct child profile can own a meaningful part of the work with concrete profile-fit evidence, or direct_execution_requested is true.

When choosing self_solve while available direct children exist, unresolved_reason is required and must state why delegation is not suitable from the provided executor profile context.

If no direct child can take the work, choose self_solve, ask_user, return_to_parent, or fail_with_reason. Do not invent fallback targets outside the allowed action set.

Low confidence is not a stop condition. It is a reason to choose a better path or self-solve inside the current executor's ability and allowed tools.

Follow the count-signal recovery rule owned by `recovery_policy.md` when previous execution telemetry is present.

Choose fail_with_reason only when no viable strategy remains inside policy boundaries.

If the current request or parent handoff indicates explicit user cancellation, stop delegation and recovery, then choose return_to_parent or fail_with_reason with a cancellation reason.

## Out Of Scope

- This module does not own runtime prompt policy content, executor profile storage, topology graph storage, tool execution, memory writes, channel delivery, UI behavior, logging, or final response wording.

## Runtime Input

{{contextJson}}
