import { describe, expect, it } from "vitest"
import {
  applyAuditedWorkRecordStatusTransition,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"

function workRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "running",
    user_request_summary: "Create a short plan.",
    request_diagnosis: {
      diagnosis_summary: "The user asked for a plan.",
      intent: "plan_request",
      goal: "Create a short plan.",
      constraints: [],
      missing_information: [],
      risk: "low",
      confidence: "high",
      recommended_action: "plan",
      reason: "Planning is directly requested.",
    },
    step_plan: [{
      step_id: "step-1",
      owner_agent_name: "마당쇠",
      action_type: "plan",
      input_refs: ["user-request"],
      expected_output: "A concise plan.",
      completion_criteria: "The plan has ordered steps.",
      status: "completed",
    }],
    step_results: [{
      step_id: "step-1",
      status: "completed",
      output_ref: "result-1",
      evidence_refs: ["plan-draft"],
      completed_at: 1,
    }],
    result_diagnosis: {
      diagnosis_summary: "The plan satisfies the request.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The result meets the completion criteria.",
    },
    retry_count: 0,
    retry_limit: 2,
    action_decision: {
      selected_action: "final_report",
      reason: "All required steps are complete.",
    },
    ...overrides,
  }
}

describe("task0787 audited work record transition application", () => {
  it("returns a new record only after a valid audited transition", () => {
    const original = workRecord()

    const result = applyAuditedWorkRecordStatusTransition(original, "completed")

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.transition).toEqual({ ok: true })
    expect(result.audit.status).toBe("valid")
    expect(result.record).not.toBe(original)
    expect(original.status).toBe("running")
    expect(result.record.status).toBe("completed")
  })

  it("keeps the original record when the transition is invalid", () => {
    const original = workRecord({ status: "completed" })

    const result = applyAuditedWorkRecordStatusTransition(original, "running")

    expect(result.ok).toBe(false)
    expect(result.changed).toBe(false)
    expect(result.record).toBe(original)
    expect(result.record.status).toBe("completed")
    expect(result.audit.status).toBe("invalid")
    expect(result.audit.developmentLog.transition?.reasonCode).toBe("transition_not_allowed")
  })

  it("applies a changed recovery action regardless of retry count", () => {
    const original = workRecord({
      status: "failed",
      retry_count: 2,
      retry_limit: 2,
      step_plan: [{
        ...workRecord().step_plan[0]!,
        status: "failed",
      }],
      step_results: [{
        ...workRecord().step_results[0]!,
        status: "failed",
        error: "Plan validation failed.",
      }],
      result_diagnosis: {
        diagnosis_summary: "The plan failed.",
        sufficiency: "insufficient",
        missing_information: [],
        conflicts: [],
        risk: "none",
        risks: ["The previous strategy failed."],
        confidence: "high",
        recommended_action: "retry",
        reason: "A changed validation strategy is available.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "The failed work should retry with a changed strategy.",
      },
      failure_diagnosis: {
        failed_step_id: "step-1",
        failure_reason: "The plan did not pass validation.",
        failed_input_refs: ["user-request"],
        failed_strategy: "initial-plan",
        recoverable: true,
      },
      recovery_candidates: [{
        action_type: "retry",
        changed_input_or_strategy: "reviewed-plan",
        expected_benefit: "Uses an independent review before retrying.",
        risk: "low",
        changed_dimensions: ["validation_method"],
      }],
      selected_recovery_action: {
        action_type: "retry",
        changed_input_or_strategy: "reviewed-plan",
        expected_benefit: "Uses an independent review before retrying.",
        risk: "low",
        changed_dimensions: ["validation_method"],
      },
      stop_condition: "Stop after verified completion or verified path exhaustion.",
    })

    const result = applyAuditedWorkRecordStatusTransition(original, "planned")

    expect(result.ok).toBe(true)
    expect(result.changed).toBe(true)
    expect(result.record).not.toBe(original)
    expect(result.record.status).toBe("planned")
    expect(result.transition).toEqual({ ok: true })
    expect(result.audit.status).toBe("valid")
  })
})
