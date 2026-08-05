import {
  decideInvalidStructuredRecordRepair,
  type BlockInvalidStructuredRecordDecision,
  type AttemptStructuredRecordRepairDecision,
} from "./structured-record-repair.js"
import {
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  validateLlmRequestDiagnosisRecord,
  validateLlmResultDiagnosisRecord,
} from "./work-record.js"
import {
  createLlmDiagnosisReceipt,
  type DiagnosisSubjectKind,
  type LlmDiagnosisReceipt,
} from "./diagnosis-action-routing.js"

export type LlmDiagnosisGateTarget = "request_diagnosis" | "result_diagnosis"

export interface LlmDiagnosisGateInput {
  target: LlmDiagnosisGateTarget
  rawOutput: unknown
  ownerAgentName: string
  workId?: string
  failedStepId: string
  failedInputRefs: string[]
  failedStrategy: string
  repairAttempted: boolean
  receiptBinding?: {
    receiptId: string
    subjectKind: DiagnosisSubjectKind
    subjectPayload: unknown
  }
}

export type ValidLlmDiagnosisGateResult =
  | {
      status: "valid"
      target: "request_diagnosis"
      diagnosis: LlmRequestDiagnosisRecord
      receipt?: LlmDiagnosisReceipt
    }
  | {
      status: "valid"
      target: "result_diagnosis"
      diagnosis: LlmResultDiagnosisRecord
      receipt?: LlmDiagnosisReceipt
    }

export interface RepairRequiredLlmDiagnosisGateResult {
  status: "repair_required"
  target: LlmDiagnosisGateTarget
  repairDecision: AttemptStructuredRecordRepairDecision
}

export interface BlockedLlmDiagnosisGateResult {
  status: "blocked"
  target: LlmDiagnosisGateTarget
  repairDecision: BlockInvalidStructuredRecordDecision
}

export type LlmDiagnosisGateResult =
  | ValidLlmDiagnosisGateResult
  | RepairRequiredLlmDiagnosisGateResult
  | BlockedLlmDiagnosisGateResult

export function gateLlmDiagnosisOutput(input: LlmDiagnosisGateInput): LlmDiagnosisGateResult {
  const validation = input.target === "request_diagnosis"
    ? validateLlmRequestDiagnosisRecord(input.rawOutput)
    : validateLlmResultDiagnosisRecord(input.rawOutput)

  if (validation.ok) {
    const receipt = input.receiptBinding
      ? createLlmDiagnosisReceipt({
          receiptId: input.receiptBinding.receiptId,
          target: input.target,
          subjectKind: input.receiptBinding.subjectKind,
          subjectPayload: input.receiptBinding.subjectPayload,
          diagnosis: validation.value as LlmRequestDiagnosisRecord | LlmResultDiagnosisRecord,
        })
      : undefined
    return input.target === "request_diagnosis"
      ? {
          status: "valid",
          target: "request_diagnosis",
          diagnosis: validation.value as LlmRequestDiagnosisRecord,
          ...(receipt ? { receipt } : {}),
        }
      : {
          status: "valid",
          target: "result_diagnosis",
          diagnosis: validation.value as LlmResultDiagnosisRecord,
          ...(receipt ? { receipt } : {}),
        }
  }

  const repairDecision = decideInvalidStructuredRecordRepair({
    target: input.target,
    ownerAgentName: input.ownerAgentName,
    ...(input.workId ? { workId: input.workId } : {}),
    failedStepId: input.failedStepId,
    failedInputRefs: input.failedInputRefs,
    failedStrategy: input.failedStrategy,
    validationIssues: validation.issues,
    repairAttempted: input.repairAttempted,
  })

  return repairDecision.action === "attempt_schema_repair"
    ? { status: "repair_required", target: input.target, repairDecision }
    : { status: "blocked", target: input.target, repairDecision }
}
