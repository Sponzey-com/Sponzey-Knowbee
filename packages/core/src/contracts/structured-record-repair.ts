import type { ContractValidationIssue } from "./index.js"
import type { FailureDiagnosis } from "./work-record.js"

export type InvalidStructuredRecordRepairTarget =
  | "request_diagnosis"
  | "result_diagnosis"
  | "work_record"
  | "handoff_package"
  | "child_work_result"

export interface InvalidStructuredRecordRepairInput {
  target: InvalidStructuredRecordRepairTarget
  ownerAgentName: string
  workId?: string
  failedStepId: string
  failedInputRefs: string[]
  failedStrategy: string
  validationIssues: ContractValidationIssue[]
  repairAttempted: boolean
}

export interface AttemptStructuredRecordRepairDecision {
  action: "attempt_schema_repair"
  reasonCode: "invalid_structured_record"
  target: InvalidStructuredRecordRepairTarget
  ownerAgentName: string
  workId?: string
  failedStepId: string
  repairAttemptNumber: 1
  validationIssues: ContractValidationIssue[]
}

export interface BlockInvalidStructuredRecordDecision {
  action: "block_step"
  reasonCode: "invalid_structured_record"
  target: InvalidStructuredRecordRepairTarget
  ownerAgentName: string
  workId?: string
  failureDiagnosis: FailureDiagnosis
  stopCondition: "invalid_structured_record_after_schema_repair"
  validationIssues: ContractValidationIssue[]
}

export type InvalidStructuredRecordRepairDecision =
  | AttemptStructuredRecordRepairDecision
  | BlockInvalidStructuredRecordDecision

export function decideInvalidStructuredRecordRepair(
  input: InvalidStructuredRecordRepairInput,
): InvalidStructuredRecordRepairDecision {
  if (!input.repairAttempted) {
    return {
      action: "attempt_schema_repair",
      reasonCode: "invalid_structured_record",
      target: input.target,
      ownerAgentName: input.ownerAgentName,
      ...(input.workId ? { workId: input.workId } : {}),
      failedStepId: input.failedStepId,
      repairAttemptNumber: 1,
      validationIssues: input.validationIssues,
    }
  }

  return {
    action: "block_step",
    reasonCode: "invalid_structured_record",
    target: input.target,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    failureDiagnosis: {
      failed_step_id: input.failedStepId,
      failure_reason: "invalid_structured_record",
      failed_input_refs: input.failedInputRefs,
      failed_strategy: input.failedStrategy,
      recoverable: false,
    },
    stopCondition: "invalid_structured_record_after_schema_repair",
    validationIssues: input.validationIssues,
  }
}
