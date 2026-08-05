import { describe, expect, it } from "vitest"
import {
  decideInvalidStructuredRecordRepair,
  type ContractValidationIssue,
} from "../packages/core/src/contracts/index.ts"

const issues: ContractValidationIssue[] = [{
  path: "$.recommended_action",
  code: "contract_validation_failed",
  message: "Unsupported enum value at $.recommended_action.",
}]

describe("task0008 invalid structured record repair decision", () => {
  it("classifies a first invalid structured record as one schema repair attempt", () => {
    const decision = decideInvalidStructuredRecordRepair({
      target: "request_diagnosis",
      ownerAgentName: "마당쇠",
      failedStepId: "step-1",
      failedInputRefs: ["llm-output:request-diagnosis"],
      failedStrategy: "initial_llm_diagnosis",
      validationIssues: issues,
      repairAttempted: false,
    })

    expect(decision.action).toBe("attempt_schema_repair")
    expect(decision.reasonCode).toBe("invalid_structured_record")
    expect(decision.repairAttemptNumber).toBe(1)
    expect(decision.validationIssues).toEqual(issues)
  })

  it("classifies an invalid structured record after repair as blocked", () => {
    const decision = decideInvalidStructuredRecordRepair({
      target: "result_diagnosis",
      ownerAgentName: "마당쇠",
      workId: "work-1",
      failedStepId: "step-2",
      failedInputRefs: ["llm-output:result-diagnosis"],
      failedStrategy: "schema_repair",
      validationIssues: issues,
      repairAttempted: true,
    })

    expect(decision.action).toBe("block_step")
    expect(decision.reasonCode).toBe("invalid_structured_record")
    expect(decision.workId).toBe("work-1")
    expect(decision.failureDiagnosis).toEqual({
      failed_step_id: "step-2",
      failure_reason: "invalid_structured_record",
      failed_input_refs: ["llm-output:result-diagnosis"],
      failed_strategy: "schema_repair",
      recoverable: false,
    })
    expect(decision.stopCondition).toBe("invalid_structured_record_after_schema_repair")
  })

  it("preserves validation issue paths for later diagnostic logging", () => {
    const decision = decideInvalidStructuredRecordRepair({
      target: "work_record",
      ownerAgentName: "마당쇠",
      failedStepId: "step-3",
      failedInputRefs: ["work-record:work-1"],
      failedStrategy: "work_record_update",
      validationIssues: issues,
      repairAttempted: true,
    })

    expect(decision.validationIssues).toContainEqual(expect.objectContaining({
      path: "$.recommended_action",
    }))
  })
})
