# Work Record Policy

## Purpose

Own structured work records, handoff package records, child result records, required fields, validation, and state transitions.

## Rules

- Represent internal work as structured records, not long prose notes.
- Each work record must include `work_id`, `owner_agent_name`, `request_diagnosis`, `step_plan`, `step_results`, `result_diagnosis`, `action_decision`, and `status`.
- Validate required fields and enum values before using a work record for action decisions.
- Do not act from an invalid LLM diagnostic record or invalid work record.
- If schema repair is needed, attempt one repair before marking the step `blocked` with `invalid_structured_record`.
- Change `status` only through the allowed state transitions defined by the active work-record schema.
- Keep parent and child work records linked through explicit parent references.
- Build parent-to-child handoffs as `WorkHandoffPackage` records.
- Build child-to-parent returns as `ChildWorkResult` records.
- Follow `request_diagnosis.md` for request-diagnosis meaning and action recommendation.
- Follow `result_diagnosis.md` for raw-result interpretation and `result_review.md` for sufficiency, failure meaning, recovery candidates, and next-action recommendation.

## Diagnosis Record Contract

- `RecommendedAction` values are `direct_answer`, `ask_clarification`, `plan`, `delegate`, `use_tool`, `use_yeonjang`, `retry`, `redelegate`, `partial_report`, `final_report`, and `stop_blocked`.
- `ResultSufficiency` values are `sufficient`, `partial`, `insufficient`, and `unknown`.
- Request diagnosis records must include `diagnosis_summary`, `intent`, `goal`, `constraints`, `missing_information`, `risk`, `confidence`, `recommended_action`, and `reason`.
- Result diagnosis records must include `diagnosis_summary`, `sufficiency`, `missing_information`, `conflicts`, `risk`, `risks`, `confidence`, `recommended_action`, and `reason`. Use `risk` for the concise overall risk level and `risks` for distinct supporting risk details.
- `constraints`, `missing_information`, `conflicts`, and `risks` are string arrays.
- Diagnosis array items must be non-empty after trim.
- Diagnosis array items must be unique after trim.
- `recommended_action` must be one `RecommendedAction` value.
- `sufficiency` must be one `ResultSufficiency` value.

## Failure Recovery Record Contract

- `FailureDiagnosis` required fields are `failed_step_id`, `failure_reason`, `failed_input_refs`, `failed_strategy`, and `recoverable`.
- `failure_diagnosis.failed_input_refs` items must be non-empty.
- `failure_diagnosis.failed_input_refs` items must be unique.
- `failure_diagnosis.failed_step_id` must exist in `step_plan` for work records.
- `failure_diagnosis.failed_step_id` must exist in `failed_steps` for child work results.
- `failure_diagnosis.failed_step_id` must not reference a `completed` or `skipped` work-record step.
- `RecoveryCandidate` required fields are `action_type`, `changed_input_or_strategy`, `expected_benefit`, `risk`, and `changed_dimensions`.
- `required_permission` and `metadata` are optional `RecoveryCandidate` fields.
- `required_permission`, when present, must be non-empty.
- `metadata`, when present, must be a JSON object without `undefined` values.
- `metadata` keys, when present at any object depth, must be non-empty.
- `ActionDecision` required fields are `selected_action` and `reason`.
- `next_step_id` is optional.
- `action_decision.next_step_id`, when present, must be non-empty.
- `action_decision.next_step_id`, when present, must exist in `step_plan`.
- `action_type` and `selected_action` must be one `RecommendedAction` value.
- `changed_dimensions` must contain one or more `RecoveryChangedDimension` values for every recovery candidate.
- `changed_dimensions` items must be unique.
- A recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method before it can be selected.
- `recovery_candidates` items must be unique.
- `selected_recovery_action`, when present, must match one item in `recovery_candidates`.
- `selected_recovery_action` matching includes optional `required_permission` and `metadata` values.
- `selected_recovery_action`, when present with `failure_diagnosis`, must change input, strategy, tool, delegation target, permission, scope, or validation method.
- `failed` work records require `failure_diagnosis`, one or more `recovery_candidates`, `selected_recovery_action`, and non-empty `stop_condition`.

## Handoff Package Contract

- `WorkHandoffPackage` required fields:
  - `schemaVersion`
  - `handoff_id`
  - `work_id`
  - `parent_work_id`
  - `parent_step_id`
  - `parent_agent_name`
  - `target_agent_name`
  - `task_goal`
  - `user_request_summary`
  - `request_diagnosis`
  - `step_plan`
  - `current_step`
  - `context`
  - `constraints`
  - `allowed_tools`
  - `disallowed_actions`
  - `expected_output`
  - `quality_criteria`
  - `validation_method`
  - `retry_limit`
  - `failure_recovery_policy`
  - `memory_visibility`
  - `return_format`
- `deadline_or_budget` is optional.
- `deadline_or_budget`, when present, must be non-empty.
- `current_step.step_id` must exist in `step_plan`.
- `current_step` must match the `step_plan` item with the same `step_id`.
- `request_diagnosis.recommended_action` must be `delegate`.
- `current_step.action_type` must be `delegate`.
- `current_step.owner_agent_name` must match `target_agent_name`.
- `parent_agent_name` and `target_agent_name` must use user-facing agent names, not internal IDs.
- `target_agent_name` must differ from `parent_agent_name`.
- `work_id` must differ from `parent_work_id`.
- `context`, `constraints`, `allowed_tools`, `disallowed_actions`, and `quality_criteria` are string arrays.
- `context`, `constraints`, `allowed_tools`, and `disallowed_actions` items must be non-empty.
- `context` and `constraints` items must be unique.
- `allowed_tools` and `disallowed_actions` items must be unique after trim and lowercase normalization.
- `retry_limit` must be a non-negative integer.
- `quality_criteria` items must be non-empty.
- `quality_criteria` items must be unique.
- `quality_criteria` must include at least one non-empty item.
- `disallowed_actions` must not repeat `allowed_tools` items after trim and lowercase normalization.
- `failure_recovery_policy` must name at least one recovery changed dimension.
- `memory_visibility` must preserve explicit handoff visibility.
- `memory_visibility` must be `explicit_handoff_only`.
- `return_format` must be `ChildWorkResult`.

## Child Result Contract

- `ChildWorkResult` required fields:
  - `schemaVersion`
  - `work_id`
  - `agent_name`
  - `task_goal`
  - `status`
  - `completed_steps`
  - `failed_steps`
  - `summary`
  - `result`
  - `evidence`
  - `assumptions`
  - `risks`
  - `missing_information`
  - `actions_taken`
  - `tools_used`
  - `result_diagnosis`
  - `action_decision`
  - `recovery_attempts`
  - `needs_parent_review`
  - `recommended_next_step`
- `failure_diagnosis` is optional unless `status = failed`.
- `agent_name` must use the child agent's user-facing name, not an internal ID.
- `status` must be one `ChildWorkResultStatus` value.
- `completed_steps`, `failed_steps`, `evidence`, `assumptions`, `risks`, `missing_information`, `actions_taken`, `tools_used`, and `recovery_attempts` are arrays.
- `result_diagnosis` must follow the Diagnosis Record Contract in this prompt.
- `action_decision` must identify the next action selected by the child for parent review.
- `action_decision.selected_action` must match `result_diagnosis.recommended_action`.
- `completed_steps` and `failed_steps` items must be non-empty step ids.
- `completed_steps` and `failed_steps` must not contain duplicate step ids.
- Child step-id comparisons must use trim-normalized values.
- `evidence`, `actions_taken`, and `tools_used` items must be non-empty.
- `assumptions`, `risks`, and `missing_information` items must be non-empty.
- `evidence`, `assumptions`, `risks`, `missing_information`, and `actions_taken` items must be unique.
- `tools_used` items must be unique after trim and lowercase normalization.
- `completed` child results require `result_diagnosis.sufficiency = sufficient` and `final_report` diagnosis/action.
- `completed` child results require `evidence` or `actions_taken` for parent review.
- `completed` child results require `needs_parent_review = true`.
- `partial` child results require `result_diagnosis.sufficiency = partial` and a non-final next action.
- `partial` child results require `failed_steps` or `missing_information` for parent review.
- `partial` child results require `needs_parent_review = true`.
- `failed` child results require non-sufficient diagnosis and non-final action.
- `failed` child results require at least one `failed_steps` item and `failure_diagnosis`.
- Recoverable `failed` child results require one or more `recovery_attempts`.
- `failed` child results require `needs_parent_review = true`.
- `blocked` child results require non-sufficient diagnosis and `stop_blocked` or `ask_clarification` action.
- `blocked` child results require `missing_information` or `risks` for parent review.
- `blocked` child results require `needs_parent_review = true`.
- The same child step id must not appear in both `completed_steps` and `failed_steps`.
- `completed` child results require at least one completed step and no failed steps.
- If `failure_diagnosis` and `recovery_attempts` are present, each recovery attempt must change the failed input, strategy, tool, delegation target, permission, scope, or validation method.
- Parent agents must treat `ChildWorkResult` as review input, not as final user-facing text.

## State Contract

- `WorkRecordSource` values are `user`, `parent_agent`, `system`, and `scheduled`.
- `WorkRecordStatus` values are `intake`, `planned`, `running`, `waiting`, `completed`, `partial`, `blocked`, `failed`, and `cancelled`.
- `WorkStepActionType` values are `direct_answer`, `plan`, `delegate`, `use_tool`, `use_yeonjang`, `ask_clarification`, `validate`, and `report`.
- `WorkStepStatus` values are `pending`, `running`, `completed`, `blocked`, `failed`, and `skipped`.
- `WorkStepResultStatus` values are `completed`, `partial`, `blocked`, and `failed`.
- `ChildWorkResultStatus` values are `completed`, `partial`, `blocked`, and `failed`.
- `RecoveryChangedDimension` values are `input`, `strategy`, `tool`, `delegation_target`, `permission`, `scope`, and `validation_method`.
- Terminal `WorkRecordStatus` values are `completed` and `cancelled`.
- `retry_count` and `retry_limit` must be non-negative integers.
- `stop_condition`, when present, must be non-empty.
- `step_plan` step-id comparisons must use trim-normalized values.
- `owner_agent_name` and `step_plan.owner_agent_name` must use user-facing agent names, not internal IDs.
- `parent_work_id` and `step_results.output_ref`, when present, must be non-empty.
- `parent_agent` work records require `parent_work_id`.
- `parent_work_id`, when present, must differ from `work_id`.
- `step_results.step_id` must exist in `step_plan`.
- `step_plan.input_refs` and `step_results.evidence_refs` items must be non-empty.
- Legacy `unblock_evidence` items must be non-empty and are diagnostic-only; they do not authorize a transition.
- `step_plan.input_refs`, `step_results.evidence_refs`, and legacy `unblock_evidence` items must be unique.
- `step_results.error`, when present, must be non-empty.
- Terminal `step_results.status` values `completed`, `failed`, and `blocked` must match the corresponding `step_plan.status`.
- `partial` step results require a `step_plan.status` of `running`, `completed`, `failed`, or `blocked`.
- `failed` and `blocked` step results must include a non-empty `error` reason.

Allowed `WorkRecordStatus` transitions:

```text
intake -> planned
intake -> blocked
planned -> running
planned -> waiting
planned -> cancelled
running -> waiting
running -> completed
running -> partial
running -> failed
running -> blocked
waiting -> running
waiting -> cancelled
partial -> planned
partial -> completed
failed -> planned
failed -> blocked
blocked -> planned
blocked -> cancelled
completed -> none
cancelled -> none
```

Transition guards:

- `failed -> planned` requires `retry_count < retry_limit`, at least one `recovery_candidates` item, and `selected_recovery_action`.
- `partial -> planned` requires `retry_count < retry_limit`, at least one `recovery_candidates` item, and `selected_recovery_action`.
- `running -> partial`, `partial -> planned`, and `failed -> planned` require `failure_diagnosis.failed_step_id` to reference a non-completed, non-skipped work-record step.
- `running -> partial`, `partial -> planned`, and `failed -> planned` require `failure_diagnosis.recoverable = true`.
- `failed -> planned` requires `selected_recovery_action` to match one item in `recovery_candidates`.
- `partial -> planned` requires `selected_recovery_action` to match one item in `recovery_candidates`.
- `failed -> planned` requires `selected_recovery_action` to change the failed input, strategy, tool, delegation target, permission, scope, or validation method.
- `partial -> planned` requires `selected_recovery_action` to change the failed input, strategy, tool, delegation target, permission, scope, or validation method.
- `retry_count >= retry_limit` must reject `failed -> planned` and move to `failed -> blocked` or a user-facing partial report.
- `retry_count >= retry_limit` must reject `partial -> planned` and move to `blocked`, `failed`, or a user-facing partial report.
- `blocked -> planned` requires a verified `blocker_resolution` matching the exact `active_blocker` kind and reference and the current `work_id`.
- Free-form `unblock_evidence` never authorizes `blocked -> planned`.
- `running -> partial` requires `result_diagnosis.sufficiency = partial`, `failure_diagnosis`, at least one valid `recovery_candidates` item, and `result_diagnosis.recommended_action` of `retry`, `redelegate`, `partial_report`, or `stop_blocked`.
- `running -> partial` requires `action_decision.selected_action` to match `result_diagnosis.recommended_action`.
- `running -> partial` requires at least one completed step result with an `output_ref` and `evidence_refs`, and at least one non-completed, non-skipped step.
- When `running -> partial` selects `retry` or `redelegate`, `selected_recovery_action` must exactly match one valid `recovery_candidates` item, including metadata.
- `completed` work records require sufficient final_report diagnosis and action decision.
- `completed` work records require completed required steps and completed step results.
- `partial` work records require partial diagnosis, a matching non-final action decision, `failure_diagnosis`, and at least one `recovery_candidates` item.
- `partial` work records with `retry` or `redelegate` action decisions require `selected_recovery_action`.
- `failed` work records require non-sufficient diagnosis and non-final action decision.
- `blocked` work records require non-sufficient diagnosis and `stop_blocked` or `ask_clarification` action.
- `running -> completed` and `partial -> completed` require each non-skipped `step_plan.status = completed`.
- `running -> completed` and `partial -> completed` require all required steps to have completed results and `result_diagnosis.sufficiency = sufficient`.
- Each required completed step result must include a non-empty `output_ref` and at least one `evidence_refs` item.
- `running -> completed` and `partial -> completed` require `result_diagnosis.recommended_action = final_report` and `action_decision.selected_action = final_report`.
- `completed` and `cancelled` must not transition to another status without a new user request or a new work record.
- Invalid transitions must not mutate the work record and must be recorded as a Development Log event.

## Out Of Scope

- This module does not decide natural-language intent, result sufficiency, recovery candidates, or user-facing wording.
- This module does not decide whether delegation is appropriate, which child agent receives work, or how parent agents merge multiple child results.
