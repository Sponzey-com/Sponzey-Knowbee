import { describe, expect, it } from "vitest"
import {
  runRequestDiagnosisProviderWithRepair,
  runResultDiagnosisProviderWithRepair,
  type LlmDiagnosisProvider,
  type LlmDiagnosisSchemaRepairProvider,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The request should be planned.",
  intent: "implementation_request",
  goal: "Implement the requested behavior.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "A short plan should guide execution.",
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
  reason: "The evidence supports final reporting.",
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

class FakeRepairProvider implements LlmDiagnosisSchemaRepairProvider {
  calls: unknown[] = []

  constructor(private readonly output: unknown) {}

  async repairDiagnosis(input: unknown): Promise<unknown> {
    this.calls.push(input)
    return this.output
  }
}

describe("task0014 diagnosis provider repair orchestration", () => {
  it("does not call schema repair when request diagnosis is valid", async () => {
    const provider = new FakeDiagnosisProvider(requestDiagnosis, resultDiagnosis)
    const repairProvider = new FakeRepairProvider(requestDiagnosis)

    const result = await runRequestDiagnosisProviderWithRepair({
      provider,
      repairProvider,
      ownerAgentName: "마당쇠",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      context: ["repo state"],
      constraints: ["focused diff"],
      workId: "work-1",
      stepId: "request-diagnosis",
    })

    expect(provider.requestCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(0)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.diagnosis).toEqual(requestDiagnosis)
  })

  it("repairs invalid request diagnosis once and returns the repaired diagnosis", async () => {
    const invalidRequestDiagnosis = { ...requestDiagnosis, recommended_action: "bad_action" }
    const provider = new FakeDiagnosisProvider(invalidRequestDiagnosis, resultDiagnosis)
    const repairProvider = new FakeRepairProvider(requestDiagnosis)

    const result = await runRequestDiagnosisProviderWithRepair({
      provider,
      repairProvider,
      ownerAgentName: "마당쇠",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      context: [],
      constraints: [],
      workId: "work-1",
      stepId: "request-diagnosis",
    })

    expect(provider.requestCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(1)
    expect(repairProvider.calls[0]).toEqual(expect.objectContaining({
      target: "request_diagnosis",
      invalidRawOutput: invalidRequestDiagnosis,
      ownerAgentName: "마당쇠",
      workId: "work-1",
      stepId: "request-diagnosis",
    }))
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.diagnosis).toEqual(requestDiagnosis)
  })

  it("blocks invalid result diagnosis when schema repair also fails", async () => {
    const invalidResultDiagnosis = { ...resultDiagnosis, risks: undefined, reason: "" }
    const provider = new FakeDiagnosisProvider(requestDiagnosis, invalidResultDiagnosis)
    const repairProvider = new FakeRepairProvider(invalidResultDiagnosis)

    const result = await runResultDiagnosisProviderWithRepair({
      provider,
      repairProvider,
      ownerAgentName: "마당쇠",
      resultSummary: "Patch applied but evidence is incomplete.",
      expectedOutput: "Patch summary and verification evidence.",
      evidence: [],
      risks: ["missing test evidence"],
      workId: "work-1",
      stepId: "result-diagnosis",
    })

    expect(provider.resultCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(1)
    expect(result.status).toBe("blocked")
    if (result.status !== "blocked") return
    expect(result.repairDecision.action).toBe("block_step")
    expect(result.repairDecision.failureDiagnosis).toEqual({
      failed_step_id: "result-diagnosis",
      failure_reason: "invalid_structured_record",
      failed_input_refs: ["llm-output:repaired_result_diagnosis"],
      failed_strategy: "schema_repair",
      recoverable: false,
    })
  })
})
