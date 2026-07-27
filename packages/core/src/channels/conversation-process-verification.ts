import type {
  RequestExecutionOutcome,
  RequestExecutionOutcomeStatus,
} from "../runs/flow-contract.js"
import type { ChannelSmokeStatus } from "./smoke-runner.js"

export type ConversationVerificationChannel = "webui" | "telegram"
export type ConversationEvidenceMode = "fixture" | "browser" | "live"
export type ConversationVerificationStatus =
  | "success"
  | "failure"
  | "blocked"
  | "cancelled"
  | "additional_input_required"
export type ConversationReleaseReadiness = "passed" | "failed" | "blocked"

export interface ConversationVerificationInput {
  scenarioId: string
  channel: ConversationVerificationChannel
  userRequest: string
  expectedExecutionStatus: RequestExecutionOutcomeStatus
  expectedTargetRef: string
  allowedEffects: readonly string[]
  userReportExpected: boolean
  requiresCapabilityAdmission?: boolean | undefined
}

export interface ConversationRunBinding {
  runId: string
  requestGroupId: string
  sessionId: string
}

export interface ConversationDecisionReceipts {
  requestDiagnosisReceiptId: string
  solutionPlanReceiptId: string
  resultReviewReceiptId: string
  finalResponseReceiptId: string
  decisionReceiptOrderValid: boolean
  capabilityAdmissionReceiptId?: string | undefined
}

export interface ConversationProbeObservation {
  evidenceMode: ConversationEvidenceMode
  smokeStatus: ChannelSmokeStatus
  requestOutcome: RequestExecutionOutcome
  binding: ConversationRunBinding
  receipts: ConversationDecisionReceipts
  finalization: {
    rootOwnerFinalized: boolean
    finalAnswerCount: number
  }
  deliveryTarget: {
    channel: ConversationVerificationChannel
    targetRef: string
  }
}

export type ConversationProbeResult<T = undefined> =
  | ([T] extends [undefined] ? { status: "success" } : { status: "success"; value: T })
  | { status: "failure"; reasonCode: string }
  | { status: "blocked"; reasonCode: string }
  | { status: "cancelled"; reasonCode: string }
  | { status: "additional_input_required"; reasonCode: string }

export interface ConversationProbePort {
  start(
    input: ConversationVerificationInput,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<ConversationRunBinding>>
  observe(
    binding: ConversationRunBinding,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<ConversationProbeObservation>>
}

export interface ConversationControlProbePort {
  interact(
    binding: ConversationRunBinding,
    interaction: Readonly<{ kind: string; value?: string }>,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult>
  cancel(
    binding: ConversationRunBinding,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult>
}

export interface ConversationDeliveryEvidence {
  delivered: boolean
  channel: ConversationVerificationChannel
  targetRef: string
  receiptRef: string
}

export interface ConversationDeliveryPostCheckPort {
  verifyDelivery(
    input: Readonly<{
      binding: ConversationRunBinding
      expectedChannel: ConversationVerificationChannel
      expectedTargetRef: string
    }>,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<ConversationDeliveryEvidence>>
}

export interface ConversationVerificationResult {
  verificationStatus: ConversationVerificationStatus
  smokeStatus: ChannelSmokeStatus
  observedRequestOutcome?: RequestExecutionOutcome
  releaseReadiness: ConversationReleaseReadiness
  evidenceMode?: ConversationEvidenceMode
  reasonCode?: string
  deliveryReceiptRef?: string
}

export interface VerifyConversationProcessPorts {
  probe: ConversationProbePort
  control: ConversationControlProbePort
  delivery: ConversationDeliveryPostCheckPort
}

function releaseReadinessFor(
  status: ConversationVerificationStatus,
): ConversationReleaseReadiness {
  if (status === "success") return "passed"
  if (status === "failure") return "failed"
  return "blocked"
}

function terminalResult(
  status: Exclude<ConversationVerificationStatus, "success">,
  reasonCode: string,
  evidence?: Readonly<{
    smokeStatus?: ChannelSmokeStatus
    observation?: ConversationProbeObservation
  }>,
): ConversationVerificationResult {
  return {
    verificationStatus: status,
    smokeStatus: evidence?.smokeStatus ?? "skipped",
    ...(evidence?.observation
      ? {
          observedRequestOutcome: evidence.observation.requestOutcome,
          evidenceMode: evidence.observation.evidenceMode,
        }
      : {}),
    releaseReadiness: releaseReadinessFor(status),
    reasonCode,
  }
}

function propagateProbeResult(
  result: Exclude<ConversationProbeResult<unknown>, { status: "success"; value: unknown }>,
): ConversationVerificationResult {
  return terminalResult(result.status, result.reasonCode)
}

function validateObservation(
  input: ConversationVerificationInput,
  observation: ConversationProbeObservation,
  startedBinding: ConversationRunBinding,
): string | undefined {
  if (observation.smokeStatus !== "passed") return "smoke_not_passed"
  if (
    observation.binding.runId !== startedBinding.runId
    || observation.binding.requestGroupId !== startedBinding.requestGroupId
    || observation.binding.sessionId !== startedBinding.sessionId
  ) {
    return "observed_run_binding_mismatch"
  }
  if (observation.binding.runId !== observation.binding.requestGroupId) {
    return "request_group_binding_mismatch"
  }
  if (!observation.receipts.requestDiagnosisReceiptId.trim()) {
    return "request_diagnosis_receipt_missing"
  }
  if (!observation.receipts.solutionPlanReceiptId.trim()) {
    return "solution_plan_receipt_missing"
  }
  if (
    input.requiresCapabilityAdmission === true &&
    !observation.receipts.capabilityAdmissionReceiptId?.trim()
  ) {
    return "capability_admission_receipt_missing"
  }
  if (!observation.receipts.resultReviewReceiptId.trim()) {
    return "result_review_receipt_missing"
  }
  if (!observation.receipts.finalResponseReceiptId.trim()) {
    return "final_response_receipt_missing"
  }
  if (!observation.receipts.decisionReceiptOrderValid) {
    return "decision_receipt_order_invalid"
  }
  if (!observation.finalization.rootOwnerFinalized) return "root_finalization_missing"
  if (observation.finalization.finalAnswerCount !== 1) {
    return "final_answer_count_invalid"
  }
  if (observation.deliveryTarget.channel !== input.channel) {
    return "delivery_channel_mismatch"
  }
  if (observation.deliveryTarget.targetRef !== input.expectedTargetRef) {
    return "delivery_target_mismatch"
  }
  if (observation.requestOutcome.executionStatus !== input.expectedExecutionStatus) {
    return "execution_outcome_mismatch"
  }
  if (input.userReportExpected && observation.requestOutcome.deliveryStatus !== "delivered") {
    return "request_outcome_delivery_missing"
  }
  return undefined
}

export class VerifyConversationProcessUseCase {
  constructor(private readonly ports: VerifyConversationProcessPorts) {}

  async execute(
    input: ConversationVerificationInput,
    signal?: AbortSignal,
  ): Promise<ConversationVerificationResult> {
    const started = await this.ports.probe.start(input, signal)
    if (started.status !== "success") return propagateProbeResult(started)

    const observed = await this.ports.probe.observe(started.value, signal)
    if (observed.status !== "success") return propagateProbeResult(observed)
    const observation = observed.value

    if (observation.requestOutcome.executionStatus === "cancelled") {
      return terminalResult("cancelled", "request_cancelled", {
        smokeStatus: observation.smokeStatus,
        observation,
      })
    }
    if (
      observation.requestOutcome.executionStatus === "awaiting_user"
      || observation.requestOutcome.executionStatus === "awaiting_approval"
    ) {
      return terminalResult("additional_input_required", "request_input_required", {
        smokeStatus: observation.smokeStatus,
        observation,
      })
    }
    if (observation.requestOutcome.executionStatus === "blocked") {
      return terminalResult("blocked", "request_blocked", {
        smokeStatus: observation.smokeStatus,
        observation,
      })
    }

    const validationFailure = validateObservation(input, observation, started.value)
    if (validationFailure) {
      return terminalResult("failure", validationFailure, {
        smokeStatus: observation.smokeStatus,
        observation,
      })
    }

    let deliveryReceiptRef: string | undefined
    if (input.userReportExpected) {
      const delivery = await this.ports.delivery.verifyDelivery({
        binding: observation.binding,
        expectedChannel: input.channel,
        expectedTargetRef: input.expectedTargetRef,
      }, signal)
      if (delivery.status !== "success") {
        return terminalResult(delivery.status, delivery.reasonCode, {
          smokeStatus: observation.smokeStatus,
          observation,
        })
      }
      if (
        !delivery.value.delivered
        || delivery.value.channel !== input.channel
        || delivery.value.targetRef !== input.expectedTargetRef
        || !delivery.value.receiptRef.trim()
      ) {
        return terminalResult("failure", "visible_delivery_missing", {
          smokeStatus: observation.smokeStatus,
          observation,
        })
      }
      deliveryReceiptRef = delivery.value.receiptRef
    }

    return {
      verificationStatus: "success",
      smokeStatus: observation.smokeStatus,
      observedRequestOutcome: observation.requestOutcome,
      releaseReadiness: "passed",
      evidenceMode: observation.evidenceMode,
      ...(deliveryReceiptRef ? { deliveryReceiptRef } : {}),
    }
  }
}
