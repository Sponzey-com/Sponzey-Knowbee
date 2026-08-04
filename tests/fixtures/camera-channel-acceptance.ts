import type {
  CameraChannelAcceptanceObservation,
  CameraChannelAcceptanceSource,
} from "../../packages/core/src/channels/camera-acceptance.js"

export function successfulCameraChannelObservation(
  channel: CameraChannelAcceptanceSource,
): CameraChannelAcceptanceObservation {
  const runId = `run-camera-${channel}`
  const targetRef = `target:camera-${channel}`
  const artifactRef = "artifact:2ad772f0-c51f-4ed7-a93a-257ca769da17"
  const deliveryDestinationRef = `destination:${channel}:current-chat`
  return {
    channel,
    runId,
    requestGroupId: runId,
    capabilityAdmission: {
      receiptId: `receipt:camera-admission:${channel}`,
      capability: "yeonjang_camera_capture",
      targetRef,
    },
    captureApproval: {
      status: "approved",
      operationRef: `operation:capture:${channel}`,
      targetRef,
    },
    deliveryApproval: {
      required: channel === "telegram",
      status: channel === "telegram" ? "approved" : "not_required",
      ...(channel === "telegram"
        ? {
            operationRef: `operation:delivery:${channel}`,
            targetRef: deliveryDestinationRef,
            destinationRef: deliveryDestinationRef,
            artifactRef,
          }
        : {}),
    },
    capture: {
      dispatchCount: 1,
      status: "succeeded",
      targetRef,
      artifact: {
        artifactRef,
        mimeType: "image/jpeg",
        sizeBytes: 128,
        verification: "verified",
      },
    },
    delivery: {
      status: "delivered",
      targetBound: true,
      receiptRef: `receipt:camera-delivery:${channel}`,
      ...(channel === "telegram"
        ? {
            destinationRef: deliveryDestinationRef,
            artifactRef,
          }
        : {}),
      artifactCount: 1,
      artifactBeforeFinal: true,
    },
    completionReview: {
      performed: true,
      outcome: "complete",
    },
    finalization: {
      reviewedFinalAnswer: true,
      finalAnswerCount: 1,
    },
    publicProjectionSafe: true,
  }
}
