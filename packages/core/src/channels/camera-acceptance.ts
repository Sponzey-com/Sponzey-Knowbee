export type CameraChannelAcceptanceSource = "webui" | "telegram"
export type CameraApprovalStatus = "awaiting" | "approved" | "rejected" | "expired"
export type CameraDeliveryApprovalStatus =
  | CameraApprovalStatus
  | "not_started"
  | "not_required"
export type CameraCaptureStatus = "not_started" | "succeeded" | "failed"
export type CameraDeliveryStatus = "not_started" | "delivered" | "failed" | "partial"
export type CameraCompletionOutcome =
  | "pending"
  | "complete"
  | "partial"
  | "blocked"
  | "cancelled"

export interface CameraChannelAcceptanceObservation {
  channel: CameraChannelAcceptanceSource
  runId: string
  requestGroupId: string
  capabilityAdmission: {
    receiptId: string
    capability: string
    targetRef: string
  }
  captureApproval: {
    status: CameraApprovalStatus
    operationRef: string
    targetRef: string
  }
  deliveryApproval: {
    required: boolean
    status: CameraDeliveryApprovalStatus
    operationRef?: string
    targetRef?: string
    destinationRef?: string
    artifactRef?: string
  }
  capture: {
    dispatchCount: number
    status: CameraCaptureStatus
    targetRef?: string
    artifact?: {
      artifactRef: string
      mimeType: string
      sizeBytes: number
      verification: "verified" | "failed"
    }
  }
  delivery: {
    status: CameraDeliveryStatus
    targetBound: boolean
    receiptRef?: string
    destinationRef?: string
    artifactRef?: string
    artifactCount: number
    artifactBeforeFinal: boolean
  }
  completionReview: {
    performed: boolean
    outcome: CameraCompletionOutcome
  }
  cancellation?: {
    requested: boolean
    afterCapture: boolean
  }
  finalization: {
    reviewedFinalAnswer: boolean
    finalAnswerCount: number
  }
  publicProjectionSafe: boolean
}

export interface CameraChannelAcceptanceValidation {
  status: "passed" | "failed"
  failures: string[]
}

const CAMERA_ARTIFACT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

function isVerifiedCameraArtifact(
  artifact: CameraChannelAcceptanceObservation["capture"]["artifact"],
): boolean {
  return Boolean(
    artifact &&
    artifact.verification === "verified" &&
    artifact.artifactRef.startsWith("artifact:") &&
    artifact.artifactRef.length > "artifact:".length &&
    CAMERA_ARTIFACT_MIME_TYPES.has(artifact.mimeType) &&
    artifact.sizeBytes > 0,
  )
}

export function validateCameraChannelAcceptance(
  observation: CameraChannelAcceptanceObservation,
): CameraChannelAcceptanceValidation {
  const failures: string[] = []
  const fail = (reasonCode: string): void => {
    if (!failures.includes(reasonCode)) failures.push(reasonCode)
  }
  const targetRef = observation.capabilityAdmission.targetRef
  const captureApproved = observation.captureApproval.status === "approved"
  const deliveryApproved =
    !observation.deliveryApproval.required ||
    observation.deliveryApproval.status === "approved"
  const verifiedArtifact = isVerifiedCameraArtifact(observation.capture.artifact)

  if (!observation.runId || observation.requestGroupId !== observation.runId) {
    fail("camera_request_binding_invalid")
  }
  if (
    !observation.capabilityAdmission.receiptId ||
    observation.capabilityAdmission.capability !== "yeonjang_camera_capture"
  ) {
    fail("camera_capability_admission_invalid")
  }
  if (
    !targetRef ||
    observation.captureApproval.targetRef !== targetRef ||
    (observation.capture.targetRef !== undefined &&
      observation.capture.targetRef !== targetRef)
  ) {
    fail("camera_target_binding_invalid")
  }
  if (!observation.captureApproval.operationRef) {
    fail("camera_capture_approval_operation_missing")
  }
  if (!observation.publicProjectionSafe) {
    fail("camera_public_projection_unsafe")
  }
  if (observation.cancellation?.requested) {
    if (
      observation.cancellation.afterCapture &&
      observation.capture.status !== "succeeded"
    ) {
      fail("camera_cancellation_capture_state_invalid")
    }
    if (observation.delivery.status !== "not_started") {
      fail("camera_delivery_after_cancellation")
    }
    if (
      !observation.completionReview.performed ||
      observation.completionReview.outcome !== "cancelled"
    ) {
      fail("camera_cancellation_review_invalid")
    }
  }

  if (
    observation.deliveryApproval.required
    && observation.deliveryApproval.status === "not_started"
  ) {
    if (
      observation.deliveryApproval.operationRef !== undefined
      || observation.deliveryApproval.targetRef !== undefined
      || observation.deliveryApproval.destinationRef !== undefined
      || observation.deliveryApproval.artifactRef !== undefined
      || observation.delivery.status !== "not_started"
    ) {
      fail("camera_delivery_approval_not_started_invalid")
    }
  } else if (observation.deliveryApproval.required) {
    if (!observation.deliveryApproval.operationRef) {
      fail("camera_delivery_approval_binding_invalid")
    }
    const destinationRef = observation.deliveryApproval.destinationRef?.trim()
    if (
      !destinationRef ||
      destinationRef === targetRef ||
      (
        observation.deliveryApproval.targetRef !== undefined &&
        observation.deliveryApproval.targetRef !== destinationRef
      ) ||
      (
        observation.delivery.status !== "not_started" &&
        observation.delivery.destinationRef !== destinationRef
      )
    ) {
      fail("camera_delivery_destination_binding_invalid")
    }
    const artifactRef = observation.capture.artifact?.artifactRef
    if (
      !artifactRef ||
      observation.deliveryApproval.artifactRef !== artifactRef ||
      (
        observation.delivery.status !== "not_started" &&
        observation.delivery.artifactRef !== artifactRef
      )
    ) {
      fail("camera_delivery_artifact_binding_invalid")
    }
  } else if (observation.deliveryApproval.status !== "not_required") {
    fail("camera_delivery_approval_status_invalid")
  }

  if (captureApproved) {
    if (
      observation.capture.dispatchCount !== 1 ||
      observation.capture.status === "not_started"
    ) {
      fail("camera_capture_dispatch_count_invalid")
    }
  } else {
    if (
      observation.capture.dispatchCount !== 0 ||
      observation.capture.status !== "not_started"
    ) {
      fail("camera_capture_started_without_approval")
    }
    if (observation.delivery.status !== "not_started") {
      fail("camera_delivery_without_capture")
    }
  }

  if (observation.capture.status === "succeeded" && !verifiedArtifact) {
    fail("camera_artifact_verification_missing")
  }
  if (
    observation.capture.status === "failed" &&
    observation.delivery.status !== "not_started"
  ) {
    fail("camera_delivery_without_verified_artifact")
  }

  if (!deliveryApproved) {
    if (observation.delivery.status !== "not_started") {
      fail("camera_delivery_started_without_approval")
    }
    if (
      observation.deliveryApproval.status === "awaiting" &&
      observation.finalization.finalAnswerCount !== 0
    ) {
      fail("camera_final_answer_before_delivery_approval")
    }
  }

  if (observation.delivery.status === "delivered") {
    if (observation.capture.status !== "succeeded" || !verifiedArtifact) {
      fail("camera_delivery_without_verified_artifact")
    }
    if (
      !observation.delivery.targetBound ||
      !observation.delivery.receiptRef ||
      observation.delivery.artifactCount !== 1 ||
      !observation.delivery.artifactBeforeFinal
    ) {
      fail("camera_delivery_evidence_invalid")
    }
  }

  const terminalReportRequired =
    observation.delivery.status === "delivered" ||
    observation.delivery.status === "failed" ||
    observation.delivery.status === "partial" ||
    observation.capture.status === "failed" ||
    observation.captureApproval.status === "rejected" ||
    observation.captureApproval.status === "expired" ||
    observation.deliveryApproval.status === "rejected" ||
    observation.deliveryApproval.status === "expired" ||
    observation.cancellation?.requested === true

  if (terminalReportRequired) {
    if (!observation.completionReview.performed) {
      fail("camera_completion_review_missing")
    }
    if (
      observation.finalization.finalAnswerCount !== 1 ||
      !observation.finalization.reviewedFinalAnswer
    ) {
      fail("camera_final_answer_invalid")
    }
  } else if (
    observation.captureApproval.status === "awaiting" ||
    observation.deliveryApproval.status === "awaiting"
  ) {
    if (
      observation.completionReview.performed ||
      observation.completionReview.outcome !== "pending" ||
      observation.finalization.finalAnswerCount !== 0
    ) {
      fail("camera_approval_wait_state_invalid")
    }
  }

  if (
    observation.completionReview.outcome === "complete" &&
    (
      observation.capture.status !== "succeeded" ||
      !verifiedArtifact ||
      observation.delivery.status !== "delivered" ||
      observation.captureApproval.status !== "approved" ||
      !deliveryApproved
    )
  ) {
    fail("camera_completion_overstated")
  }
  if (
    (observation.capture.status === "failed" ||
      observation.delivery.status === "failed" ||
      observation.delivery.status === "partial") &&
    observation.completionReview.outcome === "complete"
  ) {
    fail("camera_completion_overstated")
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
  }
}
