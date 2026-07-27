import { describe, expect, it } from "vitest"
import {
  validateChildWorkResult,
  validateWorkRecord,
  validateWorkRecordActionGate,
  type ChildWorkResult,
  type WorkRecord,
} from "../packages/core/src/contracts/work-record.ts"

const CHILD_RESULT_FIELDS = [
  "work_id", "agent_name", "task_goal", "status", "completed_steps", "failed_steps",
  "summary", "result", "evidence", "assumptions", "risks", "missing_information",
  "actions_taken", "tools_used", "result_diagnosis", "action_decision",
  "failure_diagnosis", "recovery_attempts", "needs_parent_review", "recommended_next_step",
] as const

function childResult(): ChildWorkResult {
  return {
    schemaVersion: 1,
    work_id: "work:child",
    agent_name: "검증자",
    task_goal: "Verify the structured result.",
    status: "completed",
    completed_steps: ["step:verify"],
    failed_steps: [],
    summary: "Structured verification completed.",
    result: "The contract is valid.",
    evidence: ["evidence:test-pass"],
    assumptions: [],
    risks: [],
    missing_information: [],
    actions_taken: ["validated:contract"],
    tools_used: ["tests"],
    result_diagnosis: {
      diagnosis_summary: "The result satisfies the task.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "Required evidence exists.",
    },
    action_decision: { selected_action: "final_report", reason: "Parent review can proceed." },
    failure_diagnosis: null,
    recovery_attempts: [],
    needs_parent_review: true,
    recommended_next_step: "Parent should review and aggregate the result.",
  }
}

function workRecord(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work:parent",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "running",
    user_request_summary: "구조화된 결과를 검증합니다.",
    request_diagnosis: {
      diagnosis_summary: "A structured verification is required.",
      intent: "verification",
      goal: "Verify the structured result.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "The request requires a verification step.",
    },
    step_plan: [{
      step_id: "step:verify",
      owner_agent_name: "마당쇠",
      action_type: "validate",
      input_refs: ["request:current"],
      expected_output: "A structured verification result.",
      completion_criteria: "The result has valid evidence.",
      status: "running",
    }],
    step_results: [],
    result_diagnosis: {
      diagnosis_summary: "Verification is still running.",
      sufficiency: "unknown",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "low",
      recommended_action: "plan",
      reason: "No completed result exists yet.",
    },
    retry_count: 0,
    retry_limit: 1,
    action_decision: { selected_action: "plan", reason: "Continue the structured plan." },
  }
}

describe("task1272 child-result and work-record foundation", () => {
  it("contains exactly every GOAL child-result field plus schemaVersion", () => {
    expect(Object.keys(childResult()).sort()).toEqual(["schemaVersion", ...CHILD_RESULT_FIELDS].sort())
  })

  it.each(CHILD_RESULT_FIELDS)("rejects a child result missing required field %s", (field) => {
    const invalid = { ...childResult() } as Record<string, unknown>
    delete invalid[field]
    const result = validateChildWorkResult(invalid)
    expect(result.ok).toBe(false)
    expect(result.issues.some((issue) => issue.path === `$.${field}` || issue.path.startsWith(`$.${field}.`))).toBe(true)
  })

  it("requires explicit null when a completed result has no failure diagnosis", () => {
    const result = validateChildWorkResult(childResult())
    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    expect(result.value?.failure_diagnosis).toBeNull()
  })

  it("rejects unknown raw and hidden decision fields in both structured records", () => {
    for (const value of [
      { validator: validateChildWorkResult, record: { ...childResult(), raw_output: "hidden" }, path: "$.raw_output" },
      { validator: validateWorkRecord, record: { ...workRecord(), hidden_decision: "complete" }, path: "$.hidden_decision" },
    ]) {
      const result = value.validator(value.record)
      expect(result.ok).toBe(false)
      expect(result.issues).toContainEqual(expect.objectContaining({ path: value.path }))
    }
  })

  it("allows action only when it matches the structured diagnosis for the selected phase", () => {
    expect(validateWorkRecordActionGate(workRecord(), "request").ok).toBe(true)
    const invalid = workRecord()
    invalid.action_decision = { selected_action: "final_report", reason: "Raw text claimed completion." }
    const result = validateWorkRecordActionGate(invalid, "request")
    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "$.action_decision.selected_action" }))
  })
})
