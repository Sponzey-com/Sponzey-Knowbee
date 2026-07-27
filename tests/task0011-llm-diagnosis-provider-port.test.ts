import { describe, expect, it } from "vitest"
import {
  runRequestDiagnosisProvider,
  runResultDiagnosisProvider,
  type LlmDiagnosisProvider,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The user request needs a plan.",
  intent: "implementation_request",
  goal: "Implement the requested change.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "Planning is the correct next action.",
}

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The result is enough to report.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The output meets the expected result.",
}

class FakeDiagnosisProvider implements LlmDiagnosisProvider {
  requestCalls: unknown[] = []
  resultCalls: unknown[] = []

  constructor(
    private readonly requestOutput: unknown,
    private readonly resultOutput: unknown,
  ) {}

  async diagnoseRequest(input: unknown): Promise<unknown> {
    this.requestCalls.push(input)
    return this.requestOutput
  }

  async diagnoseResult(input: unknown): Promise<unknown> {
    this.resultCalls.push(input)
    return this.resultOutput
  }
}

describe("task0011 LLM diagnosis provider port", () => {
  it("runs request diagnosis through the provider port and gate", async () => {
    const provider = new FakeDiagnosisProvider(requestDiagnosis, resultDiagnosis)

    const result = await runRequestDiagnosisProvider({
      provider,
      ownerAgentName: "마당쇠",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      context: ["repo state"],
      constraints: ["focused diff"],
      workId: "work-1",
      stepId: "request-diagnosis",
      repairAttempted: false,
    })

    expect(provider.requestCalls).toHaveLength(1)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.diagnosis).toEqual(requestDiagnosis)
  })

  it("runs result diagnosis through the provider port and gate", async () => {
    const provider = new FakeDiagnosisProvider(requestDiagnosis, resultDiagnosis)

    const result = await runResultDiagnosisProvider({
      provider,
      ownerAgentName: "마당쇠",
      resultSummary: "Patch applied and tests passed.",
      expectedOutput: "Patch summary and verification evidence.",
      evidence: ["vitest passed"],
      risks: [],
      workId: "work-1",
      stepId: "result-diagnosis",
      repairAttempted: false,
    })

    expect(provider.resultCalls).toHaveLength(1)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.diagnosis).toEqual(resultDiagnosis)
  })

  it("does not return invalid provider output as actionable diagnosis", async () => {
    const provider = new FakeDiagnosisProvider(
      { ...requestDiagnosis, recommended_action: "invalid_action" },
      resultDiagnosis,
    )

    const result = await runRequestDiagnosisProvider({
      provider,
      ownerAgentName: "마당쇠",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      context: [],
      constraints: [],
      workId: "work-1",
      stepId: "request-diagnosis",
      repairAttempted: false,
    })

    expect(result.status).toBe("repair_required")
    expect(result.repairDecision.action).toBe("attempt_schema_repair")
    expect(result.repairDecision.validationIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.recommended_action" }),
    ]))
  })
})
