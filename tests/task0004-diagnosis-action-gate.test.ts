import { describe, expect, it } from "vitest"
import {
  validateWorkRecordActionGate,
  type WorkRecord,
} from "../packages/core/src/contracts/work-record.ts"

function record(selectedAction: WorkRecord["action_decision"]["selected_action"]): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1",
    owner_agent_name: "노비",
    source: "user",
    status: "running",
    user_request_summary: "Plan the work.",
    request_diagnosis: {
      diagnosis_summary: "The user needs a plan.",
      intent: "plan_request",
      goal: "Plan the work.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "Planning is requested.",
    },
    step_plan: [{
      step_id: "step-1",
      owner_agent_name: "노비",
      action_type: "plan",
      input_refs: ["user-request"],
      expected_output: "Plan.",
      completion_criteria: "Plan has steps.",
      status: "completed",
    }],
    step_results: [{
      step_id: "step-1",
      status: "completed",
      output_ref: "plan-1",
      evidence_refs: ["draft"],
      completed_at: 1,
    }],
    result_diagnosis: {
      diagnosis_summary: "The plan is enough to report.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The planned result is complete.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: selectedAction,
      reason: "Use the selected phase diagnosis.",
    },
  }
}

describe("task0004 diagnosis action gate", () => {
  it("passes when request phase action matches request diagnosis", () => {
    const result = validateWorkRecordActionGate(record("plan"), "request")

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("passes when result phase action matches result diagnosis", () => {
    const result = validateWorkRecordActionGate(record("final_report"), "result")

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
  })

  it("rejects action decisions that do not match the selected diagnosis phase", () => {
    const result = validateWorkRecordActionGate(record("delegate"), "result")

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.action_decision.selected_action",
      code: "contract_validation_failed",
      message: "Action decision must match result_diagnosis.recommended_action.",
    })
  })

  it("rejects invalid work records before action matching", () => {
    const invalid = {
      ...record("plan"),
      request_diagnosis: undefined,
    }

    const result = validateWorkRecordActionGate(invalid, "request")

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.request_diagnosis" }),
    ]))
  })
})
