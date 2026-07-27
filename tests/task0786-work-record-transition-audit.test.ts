import { describe, expect, it } from "vitest"
import {
  auditWorkRecordStatusTransition,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"

function validWorkRecord(overrides: Partial<WorkRecord> = {}): WorkRecord {
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

describe("task0786 work record transition audit", () => {
  it("records invalid status transitions as development-only audit detail", () => {
    const record = validWorkRecord({ status: "completed" })

    const audit = auditWorkRecordStatusTransition(record, "running")

    expect(record.status).toBe("completed")
    expect(audit.auditKind).toBe("status_transition")
    expect(audit.status).toBe("invalid")
    expect(audit.reasonCode).toBe("transition_not_allowed")
    expect(audit.productLog.enabled).toBe(false)
    expect(audit.fieldDebugLog.reasonCode).toBe("transition_not_allowed")
    expect(audit.fieldDebugLog.issuePaths).toEqual(["$.status"])
    expect(audit.developmentLog.transition).toEqual({
      fromStatus: "completed",
      toStatus: "running",
      reasonCode: "transition_not_allowed",
      message: "Work record status cannot transition from completed to running.",
    })
  })

  it("records missing recovery action failures with the exact transition reason", () => {
    const record = validWorkRecord({
      status: "failed",
      retry_count: 2,
      retry_limit: 2,
      result_diagnosis: {
        diagnosis_summary: "The plan failed.",
        sufficiency: "insufficient",
        missing_information: [],
        conflicts: [],
        risk: "none",
        risks: ["A changed recovery action has not been selected."],
        confidence: "high",
        recommended_action: "retry",
        reason: "A changed recovery action is required.",
      },
      action_decision: {
        selected_action: "retry",
        reason: "The failed work needs a selected recovery action.",
      },
    })

    const audit = auditWorkRecordStatusTransition(record, "planned")

    expect(audit.status).toBe("invalid")
    expect(audit.reasonCode).toBe("recovery_action_required")
    expect(audit.fieldDebugLog.summary).toContain("failed -> planned")
    expect(audit.developmentLog.transition?.reasonCode).toBe("recovery_action_required")
    expect(audit.developmentLog.transition?.message).toBe("failed to planned requires recovery candidates and a selected recovery action.")
  })

  it("keeps valid transitions diagnostic-only without invalid transition detail", () => {
    const audit = auditWorkRecordStatusTransition(validWorkRecord(), "completed")

    expect(audit.status).toBe("valid")
    expect(audit.reasonCode).toBeUndefined()
    expect(audit.productLog.enabled).toBe(false)
    expect(audit.fieldDebugLog.issueCount).toBe(0)
    expect(audit.developmentLog.validationIssues).toEqual([])
    expect(audit.developmentLog.transition).toBeUndefined()
  })
})
