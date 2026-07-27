import type Database from "better-sqlite3"
import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js"
import type { YeonjangEvidenceEnvelope } from "./evidence.js"
import { loadYeonjangSideEffectGoalValidationCandidate } from "./side-effect-goal-validation-adapter.js"
import {
  validateYeonjangSideEffectGoal,
  type YeonjangSideEffectGoalValidationReasonCode,
} from "./side-effect-goal-validation.js"
import type { YeonjangToolRiskLevel } from "./tool-mapping.js"

export type RuntimeYeonjangSideEffectGoalValidationReasonCode =
  | "manual_result_details_invalid"
  | "manual_result_not_candidate"
  | "candidate_not_ready"
  | YeonjangSideEffectGoalValidationReasonCode

export type RuntimeYeonjangSideEffectGoalValidationResult =
  | {
      status: "validated"
      evidence: YeonjangEvidenceEnvelope
      publicSummary: {
        operationId: string
        runId: string
        workId: string
        adapterId: string
        state: "MANUAL_INTERVENTION"
        revision: number
        transitionCount: number
      }
    }
  | {
      status: "not_validated"
      reasonCode: RuntimeYeonjangSideEffectGoalValidationReasonCode
      detail?: string
    }

export interface ValidateRuntimeYeonjangSideEffectGoalInput {
  db: Database.Database
  manualResultDetails: unknown
  expectedRunId: string
  expectedWorkId?: string
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
  now?: () => number
}

export async function validateRuntimeYeonjangSideEffectGoal(
  input: ValidateRuntimeYeonjangSideEffectGoalInput,
): Promise<RuntimeYeonjangSideEffectGoalValidationResult> {
  const details = record(input.manualResultDetails)
  if (!details || details.kind !== "side_effect_manual_intervention") {
    return { status: "not_validated", reasonCode: "manual_result_details_invalid" }
  }
  if (details.goalValidationCandidate !== true) {
    return { status: "not_validated", reasonCode: "manual_result_not_candidate" }
  }
  const operationId = typeof details.operationId === "string" ? details.operationId.trim() : ""
  if (!operationId) {
    return { status: "not_validated", reasonCode: "manual_result_details_invalid" }
  }

  const candidate = loadYeonjangSideEffectGoalValidationCandidate({
    db: input.db,
    operationId,
    expectedRunId: input.expectedRunId,
    ...(input.expectedWorkId ? { expectedWorkId: input.expectedWorkId } : {}),
    ...(input.now ? { now: input.now } : {}),
  })
  if (candidate.status !== "ready") {
    return {
      status: "not_validated",
      reasonCode: "candidate_not_ready",
      detail: candidate.reasonCode,
    }
  }

  const validation = await validateYeonjangSideEffectGoal({
    operation: candidate.operation,
    loadReceipt: candidate.loadReceipt,
    provider: input.provider,
    ownerAgentName: input.ownerAgentName,
    toolName: input.toolName,
    methodIds: input.methodIds,
    group: input.group,
    riskLevel: input.riskLevel,
    requiresApproval: input.requiresApproval,
    targetRef: input.targetRef,
    userRequestSummary: input.userRequestSummary,
    expectedOutput: input.expectedOutput,
    publicToolOutput: input.publicToolOutput,
    sanitizedObservedStateSummary: input.sanitizedObservedStateSummary,
    risks: input.risks ?? [],
    ...(input.collectedAt != null ? { collectedAt: input.collectedAt } : {}),
  })

  return validation.status === "validated"
    ? { status: "validated", evidence: validation.evidence, publicSummary: candidate.publicSummary }
    : {
        status: "not_validated",
        reasonCode: validation.reasonCode,
        ...(validation.detail ? { detail: validation.detail } : {}),
      }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
