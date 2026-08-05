import { describe, expect, it } from "vitest"
import {
  gateLlmDiagnosisOutput,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The user asks for a focused implementation.",
  intent: "implementation_request",
  goal: "Implement the requested change.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "The request should be planned before execution.",
}

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The result is sufficient.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The result can be reported.",
}

describe("task0010 LLM diagnosis gate", () => {
  it("returns typed request diagnosis when the raw output is valid", () => {
    const result = gateLlmDiagnosisOutput({
      target: "request_diagnosis",
      rawOutput: requestDiagnosis,
      ownerAgentName: "마당쇠",
      failedStepId: "request-diagnosis",
      failedInputRefs: ["llm-output:request"],
      failedStrategy: "initial_llm_diagnosis",
      repairAttempted: false,
    })

    expect(result.status).toBe("valid")
    expect(result.target).toBe("request_diagnosis")
    expect(result.diagnosis).toEqual(requestDiagnosis)
  })

  it("returns typed result diagnosis when the raw output is valid", () => {
    const result = gateLlmDiagnosisOutput({
      target: "result_diagnosis",
      rawOutput: resultDiagnosis,
      ownerAgentName: "마당쇠",
      failedStepId: "result-diagnosis",
      failedInputRefs: ["llm-output:result"],
      failedStrategy: "initial_llm_result_diagnosis",
      repairAttempted: false,
    })

    expect(result.status).toBe("valid")
    expect(result.target).toBe("result_diagnosis")
    expect(result.diagnosis).toEqual(resultDiagnosis)
  })

  it("requires schema repair on the first invalid diagnosis output", () => {
    const result = gateLlmDiagnosisOutput({
      target: "request_diagnosis",
      rawOutput: { ...requestDiagnosis, recommended_action: "bad_action" },
      ownerAgentName: "마당쇠",
      failedStepId: "request-diagnosis",
      failedInputRefs: ["llm-output:request"],
      failedStrategy: "initial_llm_diagnosis",
      repairAttempted: false,
    })

    expect(result.status).toBe("repair_required")
    expect(result.repairDecision.action).toBe("attempt_schema_repair")
    expect(result.repairDecision.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.recommended_action" }),
    ]))
  })

  it("blocks the step when diagnosis output is still invalid after repair", () => {
    const result = gateLlmDiagnosisOutput({
      target: "result_diagnosis",
      rawOutput: { ...resultDiagnosis, risks: undefined, reason: "" },
      ownerAgentName: "마당쇠",
      workId: "work-1",
      failedStepId: "result-diagnosis",
      failedInputRefs: ["llm-output:result"],
      failedStrategy: "schema_repair",
      repairAttempted: true,
    })

    expect(result.status).toBe("blocked")
    expect(result.repairDecision.action).toBe("block_step")
    expect(result.repairDecision.workId).toBe("work-1")
    expect(result.repairDecision.failureDiagnosis).toEqual({
      failed_step_id: "result-diagnosis",
      failure_reason: "invalid_structured_record",
      failed_input_refs: ["llm-output:result"],
      failed_strategy: "schema_repair",
      recoverable: false,
    })
  })
})
