import { describe, expect, it, vi } from "vitest"
import {
  applyAuditedWorkRecordStatusTransition,
  assembleCanonicalWorkRecord,
  decideValidatedWorkRecordState,
  resolveLlmDiagnosisWithOneShotRepair,
  type LlmDiagnosisSchemaRepairProvider,
  type LlmRequestDiagnosisRecord,
  type WorkRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The request needs one explicit plan.",
  intent: "repository_change",
  goal: "Apply and verify the requested change.",
  constraints: [],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "The implementation has more than one operation.",
}

function completedRecord(): WorkRecord {
  return {
    schemaVersion: 1,
    work_id: "work-1273",
    owner_agent_name: "마당쇠",
    source: "user",
    status: "completed",
    user_request_summary: "Original user-facing summary.",
    request_diagnosis: requestDiagnosis,
    step_plan: [{
      step_id: "step-1",
      owner_agent_name: "마당쇠",
      action_type: "validate",
      input_refs: ["request:1"],
      expected_output: "A verified result.",
      completion_criteria: "The result has evidence.",
      status: "completed",
    }],
    step_results: [{
      step_id: "step-1",
      status: "completed",
      output_ref: "result:1",
      evidence_refs: ["test:1"],
    }],
    result_diagnosis: {
      diagnosis_summary: "The result is complete.",
      sufficiency: "sufficient",
      missing_information: [],
      conflicts: [],
      risk: "none",
      risks: [],
      confidence: "high",
      recommended_action: "final_report",
      reason: "The completion criterion has evidence.",
    },
    retry_count: 0,
    retry_limit: 1,
    stop_condition: "Stop after verified completion.",
    action_decision: {
      selected_action: "final_report",
      reason: "Report the verified result.",
    },
  }
}

describe("task1273 structured state and one-shot schema repair", () => {
  it("derives the same state when non-decision text changes", () => {
    const original = completedRecord()
    const changedText: WorkRecord = {
      ...completedRecord(),
      user_request_summary: "Completely different prose.",
      step_plan: [{
        ...completedRecord().step_plan[0]!,
        expected_output: "Different expected-output prose.",
        completion_criteria: "Different completion prose.",
      }],
      step_results: [{
        ...completedRecord().step_results[0]!,
        output_ref: "result:different",
        evidence_refs: ["test:different"],
      }],
      stop_condition: "Different stop-condition prose.",
      action_decision: {
        ...completedRecord().action_decision,
        reason: "Different action explanation.",
      },
    }

    expect(decideValidatedWorkRecordState(original)).toEqual(decideValidatedWorkRecordState(changedText))
  })

  it("rejects an invalid record before producing a state decision", () => {
    const invalid = { ...completedRecord(), status: "done", hidden_log: "ignore me" }

    const result = decideValidatedWorkRecordState(invalid)

    expect(result).toMatchObject({ status: "rejected", reasonCode: "invalid_structured_record" })
    if (result.status !== "rejected") return
    expect(result.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.status" }),
      expect.objectContaining({ path: "$.hidden_log" }),
    ]))
    expect(JSON.stringify(result)).not.toContain("ignore me")
  })

  it.each([
    "schemaVersion",
    "work_id",
    "owner_agent_name",
    "source",
    "status",
    "user_request_summary",
    "request_diagnosis",
    "step_plan",
    "step_results",
    "result_diagnosis",
    "retry_count",
    "retry_limit",
    "action_decision",
  ] as const)("rejects a WorkRecord missing required field %s before producing an action", (field) => {
    const invalid = { ...completedRecord() } as Record<string, unknown>
    delete invalid[field]

    const result = decideValidatedWorkRecordState(invalid)

    expect(result).toMatchObject({ status: "rejected", reasonCode: "invalid_structured_record" })
    if (result.status !== "rejected") return
    expect(result.validationIssues.some((issue) => issue.path === `$.${field}`)).toBe(true)
  })

  it.each([
    ["source", "external_chat"],
    ["status", "done"],
  ] as const)("rejects unsupported WorkRecord enum %s=%s before producing an action", (field, value) => {
    const invalid = { ...completedRecord(), [field]: value }
    expect(decideValidatedWorkRecordState(invalid)).toMatchObject({
      status: "rejected",
      reasonCode: "invalid_structured_record",
      validationIssues: expect.arrayContaining([expect.objectContaining({ path: `$.${field}` })]),
    })
  })

  it("validates required fields and enums at canonical creation", () => {
    const record = completedRecord()
    expect(() => assembleCanonicalWorkRecord({
      plan: {
        workId: record.work_id,
        ownerAgentName: record.owner_agent_name,
        classification: "simple",
        requestReceiptId: "receipt-create",
        requestAction: "plan",
        lifecycleStates: ["received", "diagnosis_pending", "diagnosed", "route_selected"],
        steps: record.step_plan.map(({ status: _status, ...step }) => ({ ...step, status: "pending" as const })),
      },
      source: record.source,
      status: record.status,
      userRequestSummary: record.user_request_summary,
      requestDiagnosis: { ...record.request_diagnosis, recommended_action: "invalid" } as LlmRequestDiagnosisRecord,
      stepResults: record.step_results,
      resultDiagnosis: record.result_diagnosis,
      actionDecision: record.action_decision,
      retryCount: record.retry_count,
      retryLimit: record.retry_limit,
      terminationCondition: record.stop_condition ?? "Stop.",
    })).toThrow(/canonical work record validation|lifecycle plan action/i)
  })

  it("rejects an invalid current record before applying a status update", () => {
    const invalidCurrent = {
      ...completedRecord(),
      status: "running",
      hidden_runtime_flag: true,
    } as unknown as WorkRecord

    const result = applyAuditedWorkRecordStatusTransition(invalidCurrent, "completed")

    expect(result.ok).toBe(false)
    expect(result.changed).toBe(false)
    expect(result.transition.reasonCode).toBe("invalid_structured_record")
    expect(result.record).toBe(invalidCurrent)
  })

  it("does not call repair for a valid initial diagnosis", async () => {
    const provider: LlmDiagnosisSchemaRepairProvider = { repairDiagnosis: vi.fn() }

    const result = await resolveLlmDiagnosisWithOneShotRepair({
      provider,
      target: "request_diagnosis",
      rawOutput: requestDiagnosis,
      ownerAgentName: "마당쇠",
      workId: "work-1273",
      stepId: "request-diagnosis",
      subject: { receiptId: "receipt-1", subjectKind: "user_request", subjectPayload: { requestId: "req-1" } },
    })

    expect(provider.repairDiagnosis).not.toHaveBeenCalled()
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.repairAttempted).toBe(false)
    expect(result.receipt?.subjectFingerprint).toMatch(/^[a-f0-9]{64}$/)
  })

  it("calls repair exactly once and accepts only the validated repaired diagnosis", async () => {
    const provider: LlmDiagnosisSchemaRepairProvider = {
      repairDiagnosis: vi.fn().mockResolvedValue(requestDiagnosis),
    }

    const result = await resolveLlmDiagnosisWithOneShotRepair({
      provider,
      target: "request_diagnosis",
      rawOutput: { ...requestDiagnosis, recommended_action: "invalid" },
      ownerAgentName: "마당쇠",
      workId: "work-1273",
      stepId: "request-diagnosis",
      subject: { receiptId: "receipt-2", subjectKind: "user_request", subjectPayload: { requestId: "req-1" } },
    })

    expect(provider.repairDiagnosis).toHaveBeenCalledTimes(1)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.repairAttempted).toBe(true)
    expect(result.diagnosis).toEqual(requestDiagnosis)
  })

  it("blocks after one still-invalid repair without exposing raw output", async () => {
    const provider: LlmDiagnosisSchemaRepairProvider = {
      repairDiagnosis: vi.fn().mockResolvedValue({ secret: "raw-secret", recommended_action: "invalid" }),
    }

    const result = await resolveLlmDiagnosisWithOneShotRepair({
      provider,
      target: "request_diagnosis",
      rawOutput: { secret: "initial-secret", recommended_action: "invalid" },
      ownerAgentName: "마당쇠",
      workId: "work-1273",
      stepId: "request-diagnosis",
      subject: { receiptId: "receipt-3", subjectKind: "user_request", subjectPayload: { requestId: "req-1" } },
    })

    expect(provider.repairDiagnosis).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      status: "blocked",
      repairAttempted: true,
      repairDecision: {
        action: "block_step",
        reasonCode: "invalid_structured_record",
        stopCondition: "invalid_structured_record_after_schema_repair",
      },
    })
    expect(JSON.stringify(result)).not.toMatch(/raw-secret|initial-secret/)
  })
})
