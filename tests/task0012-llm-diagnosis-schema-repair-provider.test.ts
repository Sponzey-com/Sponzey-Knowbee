import { describe, expect, it } from "vitest"
import {
  runDiagnosisSchemaRepairProvider,
  type ContractValidationIssue,
  type LlmDiagnosisSchemaRepairProvider,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
} from "../packages/core/src/contracts/index.ts"

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The request needs a plan.",
  intent: "implementation_request",
  goal: "Implement the requested change.",
  constraints: ["Keep the change focused."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "Planning should happen before execution.",
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

const validationIssues: ContractValidationIssue[] = [{
  path: "$.recommended_action",
  code: "contract_validation_failed",
  message: "Unsupported enum value at $.recommended_action.",
}]

class FakeRepairProvider implements LlmDiagnosisSchemaRepairProvider {
  calls: unknown[] = []

  constructor(private readonly output: unknown) {}

  async repairDiagnosis(input: unknown): Promise<unknown> {
    this.calls.push(input)
    return this.output
  }
}

describe("task0012 LLM diagnosis schema repair provider", () => {
  it("repairs invalid request diagnosis output into a valid typed diagnosis", async () => {
    const provider = new FakeRepairProvider(requestDiagnosis)

    const result = await runDiagnosisSchemaRepairProvider({
      provider,
      target: "request_diagnosis",
      invalidRawOutput: { ...requestDiagnosis, recommended_action: "bad_action" },
      validationIssues,
      ownerAgentName: "마당쇠",
      workId: "work-1",
      stepId: "request-diagnosis",
    })

    expect(provider.calls).toHaveLength(1)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.diagnosis).toEqual(requestDiagnosis)
  })

  it("repairs invalid result diagnosis output into a valid typed diagnosis", async () => {
    const provider = new FakeRepairProvider(resultDiagnosis)

    const result = await runDiagnosisSchemaRepairProvider({
      provider,
      target: "result_diagnosis",
      invalidRawOutput: { ...resultDiagnosis, recommended_action: "bad_action" },
      validationIssues,
      ownerAgentName: "마당쇠",
      workId: "work-1",
      stepId: "result-diagnosis",
    })

    expect(provider.calls).toHaveLength(1)
    expect(result.status).toBe("valid")
    if (result.status !== "valid") return
    expect(result.diagnosis).toEqual(resultDiagnosis)
  })

  it("blocks when repaired output is still invalid", async () => {
    const provider = new FakeRepairProvider({ ...resultDiagnosis, risks: undefined, reason: "" })

    const result = await runDiagnosisSchemaRepairProvider({
      provider,
      target: "result_diagnosis",
      invalidRawOutput: { ...resultDiagnosis, recommended_action: "bad_action" },
      validationIssues,
      ownerAgentName: "마당쇠",
      workId: "work-1",
      stepId: "result-diagnosis",
    })

    expect(result.status).toBe("blocked")
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
