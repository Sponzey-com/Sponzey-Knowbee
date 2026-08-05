import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  canTransitionWorkRecordStatus,
  type WorkRecord,
} from "../packages/core/src/contracts/work-record.ts"

const REQUIRED_STATE_MARKERS = [
  "`WorkRecordStatus` values are `intake`, `planned`, `running`, `waiting`, `completed`, `partial`, `blocked`, `failed`, and `cancelled`.",
  "`WorkStepStatus` values are `pending`, `running`, `completed`, `blocked`, `failed`, and `skipped`.",
  "`WorkStepResultStatus` values are `completed`, `partial`, `blocked`, and `failed`.",
  "`RecoveryChangedDimension` values are `input`, `strategy`, `tool`, `delegation_target`, `permission`, `scope`, and `validation_method`.",
  "Terminal `WorkRecordStatus` values are `completed` and `cancelled`.",
  "`retry_count` and `retry_limit` must be non-negative integers.",
  "`stop_condition`, when present, must be non-empty.",
  "`step_plan` step-id comparisons must use trim-normalized values.",
] as const

const REQUIRED_TRANSITION_MARKERS = [
  "intake -> planned",
  "intake -> blocked",
  "planned -> running",
  "planned -> waiting",
  "planned -> cancelled",
  "running -> waiting",
  "running -> completed",
  "running -> partial",
  "running -> failed",
  "running -> blocked",
  "waiting -> running",
  "waiting -> cancelled",
  "partial -> planned",
  "partial -> completed",
  "failed -> planned",
  "failed -> blocked",
  "blocked -> planned",
  "blocked -> cancelled",
  "completed -> none",
  "cancelled -> none",
] as const

function validWorkRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-state-contract",
    owner_agent_name: "노비",
    source: "user",
    status: "running",
    user_request_summary: "Validate work-record status prompt.",
    request_diagnosis: {
      diagnosis_summary: "The request needs validation.",
      intent: "validation",
      goal: "Validate work-record prompt state contract.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "A plan and validation are required.",
    },
    step_plan: [{
      step_id: "step-1",
      owner_agent_name: "노비",
      action_type: "validate",
      input_refs: ["prompt:work_record"],
      expected_output: "A valid state contract.",
      completion_criteria: "State values and transitions are documented.",
      status: "completed",
    }],
    step_results: [{
      step_id: "step-1",
      status: "completed",
      output_ref: "state-contract",
      evidence_refs: ["prompt:work_record"],
      completed_at: 1,
    }],
    result_diagnosis: {
      diagnosis_summary: "The contract is sufficient.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "Required state contract is present.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: "final_report",
      reason: "Validation passed.",
    },
    ...overrides,
  }
}

describe("task0276 work record state contract prompt", () => {
  it("documents the runtime work-record state values and transition table", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(prompt).toContain("## State Contract")
    for (const marker of REQUIRED_STATE_MARKERS) {
      expect(prompt).toContain(marker)
    }
    for (const marker of REQUIRED_TRANSITION_MARKERS) {
      expect(prompt).toContain(marker)
    }
  })

  it("keeps documented transition guards aligned with runtime transition behavior", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(canTransitionWorkRecordStatus(validWorkRecord({ status: "running" }), "completed")).toEqual({ ok: true })
    expect(canTransitionWorkRecordStatus(validWorkRecord({ status: "completed" }), "running")).toEqual({
      ok: false,
      reasonCode: "transition_not_allowed",
      message: "Work record status cannot transition from completed to running.",
    })
    expect(prompt).toContain("failed -> planned` requires `retry_count < retry_limit`")
    expect(prompt).toContain("partial -> planned` requires `retry_count < retry_limit`")
    expect(prompt).toContain("`failed -> planned` requires `selected_recovery_action` to change the failed input, strategy, tool, delegation target, permission, scope, or validation method.")
    expect(prompt).toContain("`partial -> planned` requires `selected_recovery_action` to change the failed input, strategy, tool, delegation target, permission, scope, or validation method.")
    expect(prompt).toContain("`failed -> planned` requires `selected_recovery_action` to match one item in `recovery_candidates`.")
    expect(prompt).toContain("`partial -> planned` requires `selected_recovery_action` to match one item in `recovery_candidates`.")
    expect(prompt).toContain("`retry_count >= retry_limit` must reject `failed -> planned`")
    expect(prompt).toContain("`retry_count >= retry_limit` must reject `partial -> planned`")
    expect(prompt).toContain("`blocked -> planned` requires a verified `blocker_resolution`")
    expect(prompt).toContain("Free-form `unblock_evidence` never authorizes `blocked -> planned`.")
    expect(prompt).toContain("`running -> partial` requires `result_diagnosis.sufficiency = partial`")
    expect(prompt).toContain("`running -> partial`, `partial -> planned`, and `failed -> planned` require `failure_diagnosis.failed_step_id` to reference a non-completed, non-skipped work-record step.")
    expect(prompt).toContain("`running -> partial`, `partial -> planned`, and `failed -> planned` require `failure_diagnosis.recoverable = true`.")
    expect(prompt).toContain("`running -> partial` requires `action_decision.selected_action` to match `result_diagnosis.recommended_action`.")
    expect(prompt).toContain("`running -> partial` requires at least one completed step result with an `output_ref` and `evidence_refs`, and at least one non-completed, non-skipped step.")
    expect(prompt).toContain("When `running -> partial` selects `retry` or `redelegate`, `selected_recovery_action` must exactly match one valid `recovery_candidates` item, including metadata.")
    expect(prompt).toContain("`completed` work records require sufficient final_report diagnosis and action decision.")
    expect(prompt).toContain("`completed` work records require completed required steps and completed step results.")
    expect(prompt).toContain("`partial` work records require partial diagnosis, a matching non-final action decision, `failure_diagnosis`, and at least one `recovery_candidates` item.")
    expect(prompt).toContain("`partial` work records with `retry` or `redelegate` action decisions require `selected_recovery_action`.")
    expect(prompt).toContain("`failed` work records require non-sufficient diagnosis and non-final action decision.")
    expect(prompt).toContain("`blocked` work records require non-sufficient diagnosis and `stop_blocked` or `ask_clarification` action.")
    expect(prompt).toContain("`running -> completed` and `partial -> completed` require each non-skipped `step_plan.status = completed`.")
    expect(prompt).toContain("Each required completed step result must include a non-empty `output_ref` and at least one `evidence_refs` item.")
    expect(prompt).toContain("`running -> completed` and `partial -> completed` require `result_diagnosis.recommended_action = final_report` and `action_decision.selected_action = final_report`.")
    expect(prompt).toContain("`completed` and `cancelled` must not transition to another status without a new user request or a new work record.")
    expect(prompt).toContain("Invalid transitions must not mutate the work record and must be recorded as a Development Log event.")
  })

  it("documents step result consistency guards in work_record", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts", "work_record.md"), "utf-8")

    expect(prompt).toContain("`action_decision.next_step_id`, when present, must exist in `step_plan`.")
    expect(prompt).toContain("`step_results.step_id` must exist in `step_plan`.")
    expect(prompt).toContain("`owner_agent_name` and `step_plan.owner_agent_name` must use user-facing agent names, not internal IDs.")
    expect(prompt).toContain("`parent_work_id` and `step_results.output_ref`, when present, must be non-empty.")
    expect(prompt).toContain("`parent_agent` work records require `parent_work_id`.")
    expect(prompt).toContain("`parent_work_id`, when present, must differ from `work_id`.")
    expect(prompt).toContain("`step_plan.input_refs` and `step_results.evidence_refs` items must be non-empty.")
    expect(prompt).toContain("Legacy `unblock_evidence` items must be non-empty and are diagnostic-only")
    expect(prompt).toContain("`step_plan.input_refs`, `step_results.evidence_refs`, and legacy `unblock_evidence` items must be unique.")
    expect(prompt).toContain("`step_results.error`, when present, must be non-empty.")
    expect(prompt).toContain("Terminal `step_results.status` values `completed`, `failed`, and `blocked` must match the corresponding `step_plan.status`.")
    expect(prompt).toContain("`failed` and `blocked` step results must include a non-empty `error` reason.")
  })
})
