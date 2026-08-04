import type {
  RequestExecutionOutcome,
  RequestExecutionOutcomeStatus,
} from "../runs/flow-contract.js"
import type { ApprovalInteractionDecision } from "./contracts.js"
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
  requiresDistinctDecisionReceipts?: boolean | undefined
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
  pendingInteraction?: ConversationPendingInteraction | undefined
}

export interface ConversationPendingInteraction {
  kind: "approval"
  approvalRequestRef: string
}

export interface ConversationApprovalDecisionInteraction {
  kind: "approval_decision"
  approvalRequestRef: string
  decision: ApprovalInteractionDecision
}

export type ConversationControlInteraction =
  ConversationApprovalDecisionInteraction

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
    interaction: Readonly<ConversationControlInteraction>,
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

export interface VerifyConversationProcessOptions {
  fixtureInteractions?: readonly ConversationControlInteraction[] | undefined
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

function validateObservationBinding(
  observation: ConversationProbeObservation,
  startedBinding: ConversationRunBinding,
): string | undefined {
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
  return undefined
}

function validateObservation(
  input: ConversationVerificationInput,
  observation: ConversationProbeObservation,
  startedBinding: ConversationRunBinding,
): string | undefined {
  if (observation.smokeStatus !== "passed") return "smoke_not_passed"
  const bindingFailure = validateObservationBinding(observation, startedBinding)
  if (bindingFailure) return bindingFailure
  if (!observation.receipts.requestDiagnosisReceiptId.trim()) {
    return "request_diagnosis_receipt_missing"
  }
  if (!observation.receipts.solutionPlanReceiptId.trim()) {
    return "solution_plan_receipt_missing"
  }
  if (
    input.requiresDistinctDecisionReceipts === true
    && observation.receipts.requestDiagnosisReceiptId
      === observation.receipts.solutionPlanReceiptId
  ) {
    return "decision_receipts_not_distinct"
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
  constructor(
    private readonly ports: VerifyConversationProcessPorts,
    private readonly options: Readonly<VerifyConversationProcessOptions> = {},
  ) {}

  async execute(
    input: ConversationVerificationInput,
    signal?: AbortSignal,
  ): Promise<ConversationVerificationResult> {
    const started = await this.ports.probe.start(input, signal)
    if (started.status !== "success") return propagateProbeResult(started)

    let fixtureInteractionIndex = 0
    let observation: ConversationProbeObservation
    while (true) {
      const observed = await this.ports.probe.observe(started.value, signal)
      if (observed.status !== "success") return propagateProbeResult(observed)
      observation = observed.value

      const bindingFailure = validateObservationBinding(observation, started.value)
      if (bindingFailure) {
        return terminalResult("failure", bindingFailure, {
          smokeStatus: observation.smokeStatus,
          observation,
        })
      }

      if (observation.requestOutcome.executionStatus === "cancelled") {
        return terminalResult("cancelled", "request_cancelled", {
          smokeStatus: observation.smokeStatus,
          observation,
        })
      }
      if (observation.requestOutcome.executionStatus === "awaiting_user") {
        return terminalResult("additional_input_required", "request_input_required", {
          smokeStatus: observation.smokeStatus,
          observation,
        })
      }
      if (observation.requestOutcome.executionStatus === "awaiting_approval") {
        const interaction = this.options.fixtureInteractions?.[fixtureInteractionIndex]
        if (observation.evidenceMode !== "fixture" || !interaction) {
          return terminalResult("additional_input_required", "request_input_required", {
            smokeStatus: observation.smokeStatus,
            observation,
          })
        }
        const pending = observation.pendingInteraction
        if (!pending?.approvalRequestRef.trim()) {
          return terminalResult("failure", "pending_approval_ref_missing", {
            smokeStatus: observation.smokeStatus,
            observation,
          })
        }
        if (
          interaction.kind !== "approval_decision"
          || !["allow_once", "allow_run", "deny"].includes(interaction.decision)
        ) {
          return terminalResult("failure", "approval_interaction_invalid", {
            smokeStatus: observation.smokeStatus,
            observation,
          })
        }
        if (interaction.approvalRequestRef !== pending.approvalRequestRef) {
          return terminalResult("failure", "approval_interaction_ref_mismatch", {
            smokeStatus: observation.smokeStatus,
            observation,
          })
        }
        const controlled = await this.ports.control.interact(
          observation.binding,
          interaction,
          signal,
        )
        if (controlled.status !== "success") {
          return terminalResult(controlled.status, controlled.reasonCode, {
            smokeStatus: observation.smokeStatus,
            observation,
          })
        }
        fixtureInteractionIndex += 1
        continue
      }
      if (observation.requestOutcome.executionStatus === "blocked") {
        return terminalResult("blocked", "request_blocked", {
          smokeStatus: observation.smokeStatus,
          observation,
        })
      }
      break
    }

    if (
      observation.evidenceMode === "fixture"
      && fixtureInteractionIndex !== (this.options.fixtureInteractions?.length ?? 0)
    ) {
      return terminalResult("failure", "fixture_interaction_unused", {
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
