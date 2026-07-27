import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js"
import type { SideEffectOperationReceipt } from "../contracts/side-effect-operation.js"
import type { SideEffectOperationAggregate } from "../runs/side-effect-operation-use-case.js"
import type { YeonjangEvidenceEnvelope } from "./evidence.js"
import { buildYeonjangEvidenceEnvelope } from "./evidence.js"
import { validateYeonjangGoalWithLlm } from "./goal-validation.js"
import type { YeonjangToolRiskLevel } from "./tool-mapping.js"

export type YeonjangSideEffectGoalValidationReasonCode =
  | "side_effect_operation_not_manual"
  | "side_effect_operation_receipt_missing"
  | "side_effect_operation_receipt_invalid"
  | "llm_goal_validation_failed"

export type YeonjangSideEffectGoalValidationResult =
  | { status: "validated"; evidence: YeonjangEvidenceEnvelope }
  | {
      status: "not_validated"
      reasonCode: YeonjangSideEffectGoalValidationReasonCode
      detail?: string
    }

export interface ValidateYeonjangSideEffectGoalInput {
  operation: SideEffectOperationAggregate
  loadReceipt: (receiptId: string) => SideEffectOperationReceipt | undefined
  provider: LlmDiagnosisProvider
  ownerAgentName: string
  toolName: string
  methodIds: string[]
  group: string
  riskLevel: YeonjangToolRiskLevel
  requiresApproval: boolean
  targetRef: string
  userRequestSummary: string
  expectedOutput: string
  publicToolOutput: string
  sanitizedObservedStateSummary: string
  risks?: string[]
  collectedAt?: number
}

export async function validateYeonjangSideEffectGoal(
  input: ValidateYeonjangSideEffectGoalInput,
): Promise<YeonjangSideEffectGoalValidationResult> {
  if (input.operation.state !== "MANUAL_INTERVENTION") {
    return { status: "not_validated", reasonCode: "side_effect_operation_not_manual" }
  }

  const receipts = input.operation.transitions.map((transition) => {
    const receipt = input.loadReceipt(transition.receiptRef)
    return { transition, receipt }
  })
  const missing = receipts.find((item) => !item.receipt)
  if (missing) {
    return {
      status: "not_validated",
      reasonCode: "side_effect_operation_receipt_missing",
      detail: missing.transition.receiptRef,
    }
  }
  const invalid = receipts.find((item) => item.receipt?.operationId !== input.operation.identity.operationId)
  if (invalid) {
    return {
      status: "not_validated",
      reasonCode: "side_effect_operation_receipt_invalid",
      detail: invalid.transition.receiptRef,
    }
  }

  const evidenceRefs = receipts
    .flatMap((item) => item.receipt?.evidenceRefs ?? [])
    .map((ref) => ref.trim())
    .filter(Boolean)
  const validation = await validateYeonjangGoalWithLlm({
    provider: input.provider,
    ownerAgentName: input.ownerAgentName,
    workId: input.operation.identity.workId,
    stepId: input.operation.identity.stepKey,
    toolName: input.toolName,
    userRequestSummary: input.userRequestSummary,
    expectedOutput: input.expectedOutput,
    publicToolOutput: input.publicToolOutput,
    sanitizedObservedStateSummary: input.sanitizedObservedStateSummary,
    evidenceRefs,
    risks: input.risks ?? [],
  })

  if (validation.status !== "validated") {
    return {
      status: "not_validated",
      reasonCode: "llm_goal_validation_failed",
      detail: validation.reasonCode,
    }
  }

  return {
    status: "validated",
    evidence: buildYeonjangEvidenceEnvelope({
      targetRef: input.targetRef,
      toolName: input.toolName,
      methodIds: input.methodIds,
      group: input.group,
      riskLevel: input.riskLevel,
      requiresApproval: input.requiresApproval,
      summary: `${input.toolName} goal validated by LLM result diagnosis.`,
      postCheck: validation.postCheck,
      ...(input.collectedAt != null ? { collectedAt: input.collectedAt } : {}),
    }),
  }
}
