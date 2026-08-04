import type {
  CameraChannelAcceptanceObservation,
} from "./camera-acceptance.js"
import type {
  ConversationDecisionReceipts,
  ConversationEvidenceMode,
  ConversationProbeObservation,
  ConversationProbeResult,
  ConversationProbePort,
  ConversationRunBinding,
  ConversationVerificationInput,
  ConversationVerificationChannel,
} from "./conversation-process-verification.js"
import type { ChannelSmokeStatus } from "./smoke-runner.js"
import type { RequestExecutionOutcome } from "../runs/flow-contract.js"

const SHA256_FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/u
const CAMERA_TOOL_NAME = "yeonjang_camera_capture"

export interface CameraConversationPreEffectFacts {
  evidenceMode: ConversationEvidenceMode
  smokeStatus: ChannelSmokeStatus
  binding: ConversationRunBinding
  requestOutcome: RequestExecutionOutcome
  receipts: ConversationDecisionReceipts
  deliveryTarget: {
    channel: ConversationVerificationChannel
    targetRef: string
  }
  approval: {
    approvalRequestRef: string
    runId: string
    requestGroupId: string
    toolName: string
    status: "requested"
    executionTargetFingerprint: string
  }
  capabilityAdmission: {
    receiptId: string
    capability: string
    executionTargetFingerprint: string
  }
  effect: {
    startEffectCount: number
    remoteCaptureCount: number
  }
}

export interface CameraConversationPreEffectSnapshot {
  conversation: ConversationProbeObservation
  camera: CameraChannelAcceptanceObservation
}

export interface CameraConversationPostEffectFacts {
  evidenceMode: ConversationEvidenceMode
  smokeStatus: ChannelSmokeStatus
  binding: ConversationRunBinding
  requestOutcome: RequestExecutionOutcome
  receipts: ConversationDecisionReceipts
  deliveryTarget: {
    channel: ConversationVerificationChannel
    targetRef: string
  }
  approval: {
    approvalRequestRef: string
    runId: string
    requestGroupId: string
    toolName: string
    status: "consumed"
    executionTargetFingerprint: string
  }
  capabilityAdmission: {
    receiptId: string
    capability: string
    executionTargetFingerprint: string
  }
  effect: {
    startEffectCount: number
    remoteCaptureCount: number
    verificationPassedCount: number
  }
  artifact: {
    artifactRef: string
    mimeType: string
    sizeBytes: number
    verification: "verified"
  }
}

export type CameraConversationPostEffectSnapshot =
  CameraConversationPreEffectSnapshot

export interface CameraConversationDeliveryApprovalFacts {
  capture: CameraConversationPostEffectFacts
  deliveryApproval: {
    approvalRequestRef: string
    runId: string
    requestGroupId: string
    toolName: "telegram_send_file"
    status: "requested"
    executionTargetFingerprint: string
    artifactRef: string
  }
}

export interface CameraConversationCompletedFacts {
  capture: CameraConversationPostEffectFacts
  requestOutcome: RequestExecutionOutcome & {
    executionStatus: "succeeded"
    deliveryStatus: "delivered"
  }
  deliveryApproval: {
    approvalRequestRef: string
    runId: string
    requestGroupId: string
    toolName: "telegram_send_file"
    status: "consumed"
    executionTargetFingerprint: string
    artifactRef: string
  }
  delivery: {
    providerSendCount: number
    receiptCount: number
    receiptRef: string
    artifactRef: string
    executionTargetFingerprint: string
  }
  completionReview: {
    invocationCount: number
    receiptId: string
    status: "complete"
  }
  finalResponse: {
    deliveryCount: number
    receiptId: string
    language: "ko" | "en"
    rootOwnerFinalized: true
  }
}

export interface CameraConversationProbeAdapterDependencies {
  startRootRun(
    input: ConversationVerificationInput,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<ConversationRunBinding>>
  readPreEffectFacts(
    binding: ConversationRunBinding,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<CameraConversationPreEffectFacts>>
  consumeSnapshot?(
    snapshot: Readonly<CameraConversationPreEffectSnapshot>,
  ): void
}

export class CameraConversationProbeAdapter implements ConversationProbePort {
  constructor(
    private readonly dependencies:
      Readonly<CameraConversationProbeAdapterDependencies>,
  ) {}

  start(
    input: ConversationVerificationInput,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<ConversationRunBinding>> {
    return this.dependencies.startRootRun(input, signal)
  }

  async observe(
    binding: ConversationRunBinding,
    signal?: AbortSignal,
  ): Promise<ConversationProbeResult<ConversationProbeObservation>> {
    const facts = await this.dependencies.readPreEffectFacts(binding, signal)
    if (facts.status !== "success") return facts
    const projected = projectCameraConversationPreEffectSnapshot(facts.value)
    if (projected.status !== "success") return projected
    this.dependencies.consumeSnapshot?.(projected.value)
    return {
      status: "success",
      value: projected.value.conversation,
    }
  }
}

function freezeConversation(
  observation: ConversationProbeObservation,
): ConversationProbeObservation {
  return Object.freeze({
    ...observation,
    requestOutcome: Object.freeze({ ...observation.requestOutcome }),
    binding: Object.freeze({ ...observation.binding }),
    receipts: Object.freeze({ ...observation.receipts }),
    finalization: Object.freeze({ ...observation.finalization }),
    deliveryTarget: Object.freeze({ ...observation.deliveryTarget }),
    ...(observation.pendingInteraction
      ? {
          pendingInteraction: Object.freeze({
            ...observation.pendingInteraction,
          }),
        }
      : {}),
  })
}

function freezeCamera(
  observation: CameraChannelAcceptanceObservation,
): CameraChannelAcceptanceObservation {
  return Object.freeze({
    ...observation,
    capabilityAdmission: Object.freeze({
      ...observation.capabilityAdmission,
    }),
    captureApproval: Object.freeze({ ...observation.captureApproval }),
    deliveryApproval: Object.freeze({ ...observation.deliveryApproval }),
    capture: Object.freeze({ ...observation.capture }),
    delivery: Object.freeze({ ...observation.delivery }),
    completionReview: Object.freeze({ ...observation.completionReview }),
    finalization: Object.freeze({ ...observation.finalization }),
  })
}

export function projectCameraConversationPreEffectSnapshot(
  facts: Readonly<CameraConversationPreEffectFacts>,
): ConversationProbeResult<CameraConversationPreEffectSnapshot> {
  const binding = facts.binding
  const approval = facts.approval
  const admission = facts.capabilityAdmission
  if (
    !binding.runId.trim()
    || binding.requestGroupId !== binding.runId
    || !binding.sessionId.trim()
    || approval.runId !== binding.runId
    || approval.requestGroupId !== binding.requestGroupId
  ) {
    return {
      status: "failure",
      reasonCode: "camera_pre_effect_binding_invalid",
    }
  }
  if (
    approval.toolName !== CAMERA_TOOL_NAME
    || admission.capability !== CAMERA_TOOL_NAME
    || !approval.approvalRequestRef.trim()
    || !admission.receiptId.trim()
  ) {
    return {
      status: "failure",
      reasonCode: "camera_pre_effect_contract_invalid",
    }
  }
  if (
    !SHA256_FINGERPRINT_PATTERN.test(
      approval.executionTargetFingerprint,
    )
    || approval.executionTargetFingerprint
      !== admission.executionTargetFingerprint
  ) {
    return {
      status: "failure",
      reasonCode: "camera_pre_effect_target_binding_invalid",
    }
  }
  if (
    !["in_progress", "awaiting_approval"].includes(
      facts.requestOutcome.executionStatus,
    )
    || facts.effect.startEffectCount !== 0
    || facts.effect.remoteCaptureCount !== 0
  ) {
    return {
      status: "failure",
      reasonCode: "camera_pre_effect_state_invalid",
    }
  }
  if (
    !facts.receipts.requestDiagnosisReceiptId.trim()
    || !facts.receipts.solutionPlanReceiptId.trim()
    || facts.receipts.requestDiagnosisReceiptId
      === facts.receipts.solutionPlanReceiptId
  ) {
    return {
      status: "failure",
      reasonCode: "camera_pre_effect_decision_receipts_invalid",
    }
  }

  const conversation = freezeConversation({
    evidenceMode: facts.evidenceMode,
    smokeStatus: facts.smokeStatus,
    requestOutcome: {
      ...facts.requestOutcome,
      executionStatus: "awaiting_approval",
    },
    binding,
    receipts: facts.receipts,
    finalization: {
      rootOwnerFinalized: false,
      finalAnswerCount: 0,
    },
    deliveryTarget: facts.deliveryTarget,
    pendingInteraction: {
      kind: "approval",
      approvalRequestRef: approval.approvalRequestRef,
    },
  })
  const camera = freezeCamera({
    channel: facts.deliveryTarget.channel,
    runId: binding.runId,
    requestGroupId: binding.requestGroupId,
    capabilityAdmission: {
      receiptId: admission.receiptId,
      capability: admission.capability,
      targetRef: admission.executionTargetFingerprint,
    },
    captureApproval: {
      status: "awaiting",
      operationRef: approval.approvalRequestRef,
      targetRef: approval.executionTargetFingerprint,
    },
    deliveryApproval: {
      required: facts.deliveryTarget.channel === "telegram",
      status:
        facts.deliveryTarget.channel === "telegram"
          ? "not_started"
          : "not_required",
    },
    capture: {
      dispatchCount: facts.effect.remoteCaptureCount,
      status: "not_started",
    },
    delivery: {
      status: "not_started",
      targetBound: false,
      artifactCount: 0,
      artifactBeforeFinal: false,
    },
    completionReview: {
      performed: false,
      outcome: "pending",
    },
    finalization: {
      reviewedFinalAnswer: false,
      finalAnswerCount: 0,
    },
    publicProjectionSafe: true,
  })

  return {
    status: "success",
    value: Object.freeze({ conversation, camera }),
  }
}

export function projectCameraConversationPostEffectSnapshot(
  facts: Readonly<CameraConversationPostEffectFacts>,
): ConversationProbeResult<CameraConversationPostEffectSnapshot> {
  const binding = facts.binding
  const approval = facts.approval
  const admission = facts.capabilityAdmission
  if (
    !binding.runId.trim()
    || binding.requestGroupId !== binding.runId
    || !binding.sessionId.trim()
    || approval.runId !== binding.runId
    || approval.requestGroupId !== binding.requestGroupId
  ) {
    return {
      status: "failure",
      reasonCode: "camera_post_effect_binding_invalid",
    }
  }
  if (
    approval.toolName !== CAMERA_TOOL_NAME
    || admission.capability !== CAMERA_TOOL_NAME
    || !approval.approvalRequestRef.trim()
    || !admission.receiptId.trim()
  ) {
    return {
      status: "failure",
      reasonCode: "camera_post_effect_contract_invalid",
    }
  }
  if (
    !SHA256_FINGERPRINT_PATTERN.test(
      approval.executionTargetFingerprint,
    )
    || approval.executionTargetFingerprint
      !== admission.executionTargetFingerprint
  ) {
    return {
      status: "failure",
      reasonCode: "camera_post_effect_target_binding_invalid",
    }
  }
  if (
    facts.effect.startEffectCount !== 1
    || facts.effect.remoteCaptureCount !== 1
    || facts.effect.verificationPassedCount !== 1
  ) {
    return {
      status: "failure",
      reasonCode: "camera_post_effect_count_invalid",
    }
  }
  if (
    !/^artifact:[0-9a-f-]{36}$/iu.test(facts.artifact.artifactRef)
    || !["image/jpeg", "image/png", "image/webp"].includes(
      facts.artifact.mimeType,
    )
    || facts.artifact.sizeBytes < 1
  ) {
    return {
      status: "failure",
      reasonCode: "camera_post_effect_artifact_invalid",
    }
  }

  const conversation = freezeConversation({
    evidenceMode: facts.evidenceMode,
    smokeStatus: facts.smokeStatus,
    requestOutcome: facts.requestOutcome,
    binding,
    receipts: facts.receipts,
    finalization: {
      rootOwnerFinalized: false,
      finalAnswerCount: 0,
    },
    deliveryTarget: facts.deliveryTarget,
  })
  const camera = freezeCamera({
    channel: facts.deliveryTarget.channel,
    runId: binding.runId,
    requestGroupId: binding.requestGroupId,
    capabilityAdmission: {
      receiptId: admission.receiptId,
      capability: admission.capability,
      targetRef: admission.executionTargetFingerprint,
    },
    captureApproval: {
      status: "approved",
      operationRef: approval.approvalRequestRef,
      targetRef: approval.executionTargetFingerprint,
    },
    deliveryApproval: {
      required: facts.deliveryTarget.channel === "telegram",
      status:
        facts.deliveryTarget.channel === "telegram"
          ? "not_started"
          : "not_required",
    },
    capture: {
      dispatchCount: facts.effect.remoteCaptureCount,
      status: "succeeded",
      targetRef: admission.executionTargetFingerprint,
      artifact: { ...facts.artifact },
    },
    delivery: {
      status: "not_started",
      targetBound: false,
      artifactCount: 0,
      artifactBeforeFinal: false,
    },
    completionReview: {
      performed: false,
      outcome: "pending",
    },
    finalization: {
      reviewedFinalAnswer: false,
      finalAnswerCount: 0,
    },
    publicProjectionSafe: true,
  })
  return {
    status: "success",
    value: Object.freeze({ conversation, camera }),
  }
}

export function projectCameraConversationDeliveryApprovalSnapshot(
  facts: Readonly<CameraConversationDeliveryApprovalFacts>,
): ConversationProbeResult<CameraConversationPostEffectSnapshot> {
  const captured = projectCameraConversationPostEffectSnapshot(facts.capture)
  if (captured.status !== "success") return captured
  const delivery = facts.deliveryApproval
  const binding = facts.capture.binding
  if (
    delivery.runId !== binding.runId
    || delivery.requestGroupId !== binding.requestGroupId
    || !delivery.approvalRequestRef.trim()
    || !SHA256_FINGERPRINT_PATTERN.test(
      delivery.executionTargetFingerprint,
    )
    || delivery.executionTargetFingerprint
      === facts.capture.capabilityAdmission.executionTargetFingerprint
    || delivery.artifactRef !== facts.capture.artifact.artifactRef
  ) {
    return {
      status: "failure",
      reasonCode: "camera_delivery_approval_binding_invalid",
    }
  }
  const conversation = freezeConversation({
    ...captured.value.conversation,
    requestOutcome: {
      ...captured.value.conversation.requestOutcome,
      executionStatus: "awaiting_approval",
    },
    pendingInteraction: {
      kind: "approval",
      approvalRequestRef: delivery.approvalRequestRef,
    },
  })
  const camera = freezeCamera({
    ...captured.value.camera,
    deliveryApproval: {
      required: true,
      status: "awaiting",
      operationRef: delivery.approvalRequestRef,
      targetRef: delivery.executionTargetFingerprint,
      destinationRef: delivery.executionTargetFingerprint,
      artifactRef: delivery.artifactRef,
    },
  })
  return {
    status: "success",
    value: Object.freeze({ conversation, camera }),
  }
}

export function projectCameraConversationCompletedSnapshot(
  facts: Readonly<CameraConversationCompletedFacts>,
): ConversationProbeResult<CameraConversationPostEffectSnapshot> {
  const captured = projectCameraConversationPostEffectSnapshot(facts.capture)
  if (captured.status !== "success") return captured
  const binding = facts.capture.binding
  const deliveryApproval = facts.deliveryApproval
  const delivery = facts.delivery
  if (
    deliveryApproval.runId !== binding.runId
    || deliveryApproval.requestGroupId !== binding.requestGroupId
    || !deliveryApproval.approvalRequestRef.trim()
    || !SHA256_FINGERPRINT_PATTERN.test(
      deliveryApproval.executionTargetFingerprint,
    )
    || deliveryApproval.executionTargetFingerprint
      === facts.capture.capabilityAdmission.executionTargetFingerprint
    || deliveryApproval.artifactRef !== facts.capture.artifact.artifactRef
  ) {
    return {
      status: "failure",
      reasonCode: "camera_completed_delivery_approval_invalid",
    }
  }
  if (
    delivery.providerSendCount !== 1
    || delivery.receiptCount !== 1
    || !delivery.receiptRef.trim()
    || delivery.artifactRef !== deliveryApproval.artifactRef
    || delivery.executionTargetFingerprint
      !== deliveryApproval.executionTargetFingerprint
  ) {
    return {
      status: "failure",
      reasonCode: "camera_completed_delivery_evidence_invalid",
    }
  }
  const reviewReceiptId = facts.completionReview.receiptId.trim()
  const finalResponseReceiptId = facts.finalResponse.receiptId.trim()
  if (
    facts.completionReview.invocationCount !== 1
    || !reviewReceiptId.startsWith("completion-review:")
    || facts.finalResponse.deliveryCount !== 1
    || !/^llm-review(?:-v2)?:/u.test(finalResponseReceiptId)
    || reviewReceiptId === finalResponseReceiptId
    || reviewReceiptId === facts.capture.receipts.requestDiagnosisReceiptId
    || reviewReceiptId === facts.capture.receipts.solutionPlanReceiptId
  ) {
    return {
      status: "failure",
      reasonCode: "camera_completed_llm_receipts_invalid",
    }
  }

  const conversation = freezeConversation({
    evidenceMode: facts.capture.evidenceMode,
    smokeStatus: facts.capture.smokeStatus,
    requestOutcome: facts.requestOutcome,
    binding,
    receipts: {
      ...facts.capture.receipts,
      resultReviewReceiptId: reviewReceiptId,
      finalResponseReceiptId,
      decisionReceiptOrderValid: true,
    },
    finalization: {
      rootOwnerFinalized: facts.finalResponse.rootOwnerFinalized,
      finalAnswerCount: facts.finalResponse.deliveryCount,
    },
    deliveryTarget: facts.capture.deliveryTarget,
  })
  const camera = freezeCamera({
    ...captured.value.camera,
    deliveryApproval: {
      required: true,
      status: "approved",
      operationRef: deliveryApproval.approvalRequestRef,
      targetRef: deliveryApproval.executionTargetFingerprint,
      destinationRef: deliveryApproval.executionTargetFingerprint,
      artifactRef: deliveryApproval.artifactRef,
    },
    delivery: {
      status: "delivered",
      targetBound: true,
      receiptRef: delivery.receiptRef,
      destinationRef: delivery.executionTargetFingerprint,
      artifactRef: delivery.artifactRef,
      artifactCount: delivery.receiptCount,
      artifactBeforeFinal: true,
    },
    completionReview: {
      performed: true,
      outcome: "complete",
    },
    finalization: {
      reviewedFinalAnswer: true,
      finalAnswerCount: facts.finalResponse.deliveryCount,
    },
  })
  return {
    status: "success",
    value: Object.freeze({ conversation, camera }),
  }
}
