import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const HANDOFF_FIELDS = [
  "schemaVersion",
  "handoff_id",
  "work_id",
  "parent_work_id",
  "parent_step_id",
  "parent_agent_name",
  "target_agent_name",
  "task_goal",
  "user_request_summary",
  "request_diagnosis",
  "step_plan",
  "current_step",
  "context",
  "constraints",
  "allowed_tools",
  "disallowed_actions",
  "expected_output",
  "quality_criteria",
  "validation_method",
  "retry_limit",
  "failure_recovery_policy",
  "memory_visibility",
  "return_format",
] as const

const CHILD_RESULT_FIELDS = [
  "schemaVersion",
  "work_id",
  "agent_name",
  "task_goal",
  "status",
  "completed_steps",
  "failed_steps",
  "summary",
  "result",
  "evidence",
  "assumptions",
  "risks",
  "missing_information",
  "actions_taken",
  "tools_used",
  "result_diagnosis",
  "action_decision",
  "recovery_attempts",
  "needs_parent_review",
  "recommended_next_step",
] as const

describe("task0279 handoff and child result prompt schema ownership", () => {
  it("documents handoff and child-result field contracts in work_record", () => {
    const workRecord = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(workRecord).toContain("## Handoff Package Contract")
    expect(workRecord).toContain("`WorkHandoffPackage` required fields:")
    for (const field of HANDOFF_FIELDS) {
      expect(workRecord).toContain(`\`${field}\``)
    }
    expect(workRecord).toContain("`current_step.step_id` must exist in `step_plan`.")
    expect(workRecord).toContain("`current_step` must match the `step_plan` item with the same `step_id`.")
    expect(workRecord).toContain("`request_diagnosis.recommended_action` must be `delegate`.")
    expect(workRecord).toContain("`current_step.action_type` must be `delegate`.")
    expect(workRecord).toContain("`current_step.owner_agent_name` must match `target_agent_name`.")
    expect(workRecord).toContain("`target_agent_name` must differ from `parent_agent_name`.")
    expect(workRecord).toContain("`parent_agent_name` and `target_agent_name` must use user-facing agent names, not internal IDs.")
    expect(workRecord).toContain("`work_id` must differ from `parent_work_id`.")
    expect(workRecord).toContain("`retry_limit` must be a non-negative integer.")
    expect(workRecord).toContain("`deadline_or_budget`, when present, must be non-empty.")
    expect(workRecord).toContain("`context`, `constraints`, `allowed_tools`, and `disallowed_actions` items must be non-empty.")
    expect(workRecord).toContain("`context` and `constraints` items must be unique.")
    expect(workRecord).toContain("`allowed_tools` and `disallowed_actions` items must be unique after trim and lowercase normalization.")
    expect(workRecord).toContain("`quality_criteria` items must be non-empty.")
    expect(workRecord).toContain("`quality_criteria` items must be unique.")
    expect(workRecord).toContain("`quality_criteria` must include at least one non-empty item.")
    expect(workRecord).toContain("`disallowed_actions` must not repeat `allowed_tools` items after trim and lowercase normalization.")
    expect(workRecord).toContain("`failure_recovery_policy` must name at least one recovery changed dimension.")
    expect(workRecord).toContain("`memory_visibility` must be `explicit_handoff_only`.")
    expect(workRecord).toContain("`return_format` must be `ChildWorkResult`.")

    expect(workRecord).toContain("## Child Result Contract")
    expect(workRecord).toContain("`ChildWorkResult` required fields:")
    for (const field of CHILD_RESULT_FIELDS) {
      expect(workRecord).toContain(`\`${field}\``)
    }
    expect(workRecord).toContain("`action_decision.selected_action` must match `result_diagnosis.recommended_action`.")
    expect(workRecord).toContain("`agent_name` must use the child agent's user-facing name, not an internal ID.")
    expect(workRecord).toContain("`completed_steps` and `failed_steps` items must be non-empty step ids.")
    expect(workRecord).toContain("`completed_steps` and `failed_steps` must not contain duplicate step ids.")
    expect(workRecord).toContain("Child step-id comparisons must use trim-normalized values.")
    expect(workRecord).toContain("`evidence`, `actions_taken`, and `tools_used` items must be non-empty.")
    expect(workRecord).toContain("`assumptions`, `risks`, and `missing_information` items must be non-empty.")
    expect(workRecord).toContain("`evidence`, `assumptions`, `risks`, `missing_information`, and `actions_taken` items must be unique.")
    expect(workRecord).toContain("`tools_used` items must be unique after trim and lowercase normalization.")
    expect(workRecord).toContain("`completed` child results require `result_diagnosis.sufficiency = sufficient` and `final_report` diagnosis/action.")
    expect(workRecord).toContain("`completed` child results require `evidence` or `actions_taken` for parent review.")
    expect(workRecord).toContain("`completed` child results require `needs_parent_review = true`.")
    expect(workRecord).toContain("`partial` child results require `result_diagnosis.sufficiency = partial` and a non-final next action.")
    expect(workRecord).toContain("`partial` child results require `failed_steps` or `missing_information` for parent review.")
    expect(workRecord).toContain("`partial` child results require `needs_parent_review = true`.")
    expect(workRecord).toContain("`failed` child results require non-sufficient diagnosis and non-final action.")
    expect(workRecord).toContain("`failed` child results require at least one `failed_steps` item and `failure_diagnosis`.")
    expect(workRecord).toContain("Recoverable `failed` child results require one or more `recovery_attempts`.")
    expect(workRecord).toContain("`failed` child results require `needs_parent_review = true`.")
    expect(workRecord).toContain("`blocked` child results require non-sufficient diagnosis and `stop_blocked` or `ask_clarification` action.")
    expect(workRecord).toContain("`blocked` child results require `missing_information` or `risks` for parent review.")
    expect(workRecord).toContain("`blocked` child results require `needs_parent_review = true`.")
    expect(workRecord).toContain("The same child step id must not appear in both `completed_steps` and `failed_steps`.")
    expect(workRecord).toContain("If `failure_diagnosis` and `recovery_attempts` are present, each recovery attempt must change the failed input, strategy, tool, delegation target, permission, scope, or validation method.")
    expect(workRecord).toContain("Parent agents must treat `ChildWorkResult` as review input")
  })

  it("keeps delegation behavior separate from schema field ownership", () => {
    const delegation = readFileSync(join(process.cwd(), "prompts", "sub_agent_delegation.md"), "utf-8")
    const system = readFileSync(join(process.cwd(), "prompts", "system.md"), "utf-8")
    const soul = readFileSync(join(process.cwd(), "prompts", "soul.md"), "utf-8")

    expect(delegation).toContain("Use the `WorkHandoffPackage` schema defined by `work_record.md`")
    expect(delegation).toContain("Use the `ChildWorkResult` schema defined by `work_record.md`")
    expect(delegation).toContain("does not own handoff field names")
    expect(delegation).not.toContain("Include goal, context, constraints, allowed tools")

    expect(system).toContain("`work_record.md` owns structured work record schema, handoff package schema, child-result schema")
    expect(soul).toContain("Follow `work_record.md` for handoff package and child-result fields.")
    expect(soul).toContain("Follow `sub_agent_delegation.md` for parent-child work linkage")
  })
})
