import { describe, expect, it } from "vitest"
import {
  validateCameraChannelAcceptance,
} from "../packages/core/src/channels/camera-acceptance.ts"
import { getDefaultChannelSmokeScenarios } from "../packages/core/src/channels/smoke-runner.ts"
import { successfulCameraChannelObservation } from "./fixtures/camera-channel-acceptance.ts"

describe("Telegram camera request flow", () => {
  it("accepts one target-bound capture, verified artifact, delivery, review, and final answer", () => {
    expect(
      validateCameraChannelAcceptance(
        successfulCameraChannelObservation("telegram"),
      ),
    ).toEqual({ status: "passed", failures: [] })
  })

  it("rejects duplicate capture and delivery completion without its own approval", () => {
    const duplicate = successfulCameraChannelObservation("telegram")
    duplicate.capture.dispatchCount = 2
    const unapprovedDelivery = successfulCameraChannelObservation("telegram")
    unapprovedDelivery.deliveryApproval.status = "awaiting"

    expect(validateCameraChannelAcceptance(duplicate).failures).toContain(
      "camera_capture_dispatch_count_invalid",
    )
    expect(validateCameraChannelAcceptance(unapprovedDelivery).failures).toEqual(
      expect.arrayContaining([
        "camera_delivery_started_without_approval",
        "camera_final_answer_before_delivery_approval",
      ]),
    )
  })

  it("rejects copied capture targets, cross-chat delivery, and wrong artifact binding", () => {
    const copiedTarget = successfulCameraChannelObservation("telegram")
    copiedTarget.deliveryApproval.targetRef =
      copiedTarget.capabilityAdmission.targetRef
    copiedTarget.deliveryApproval.destinationRef =
      copiedTarget.capabilityAdmission.targetRef
    const crossChat = successfulCameraChannelObservation("telegram")
    crossChat.delivery.destinationRef = "destination:telegram:other-chat"
    const wrongArtifact = successfulCameraChannelObservation("telegram")
    wrongArtifact.deliveryApproval.artifactRef =
      "artifact:81fd9cf3-a123-4d49-b84e-46e7e6e2c82f"

    expect(validateCameraChannelAcceptance(copiedTarget).failures).toContain(
      "camera_delivery_destination_binding_invalid",
    )
    expect(validateCameraChannelAcceptance(crossChat).failures).toContain(
      "camera_delivery_destination_binding_invalid",
    )
    expect(validateCameraChannelAcceptance(wrongArtifact).failures).toContain(
      "camera_delivery_artifact_binding_invalid",
    )
  })

  it("keeps a captured artifact but rejects delivery after user cancellation", () => {
    const cancelled = successfulCameraChannelObservation("telegram")
    cancelled.cancellation = {
      requested: true,
      afterCapture: true,
    }
    cancelled.delivery.status = "not_started"
    cancelled.delivery.targetBound = false
    delete cancelled.delivery.receiptRef
    delete cancelled.delivery.destinationRef
    delete cancelled.delivery.artifactRef
    cancelled.delivery.artifactCount = 0
    cancelled.delivery.artifactBeforeFinal = false
    cancelled.completionReview.outcome = "cancelled"

    expect(validateCameraChannelAcceptance(cancelled)).toEqual({
      status: "passed",
      failures: [],
    })

    cancelled.delivery.status = "delivered"
    expect(validateCameraChannelAcceptance(cancelled).failures).toContain(
      "camera_delivery_after_cancellation",
    )
  })

  it("keeps camera acceptance opt-in without changing the five default Telegram scenarios", () => {
    const telegramScenarios = getDefaultChannelSmokeScenarios().filter(
      (scenario) => scenario.channel === "telegram",
    )

    expect(telegramScenarios).toHaveLength(5)
    expect(telegramScenarios.map((scenario) => scenario.kind)).toEqual([
      "basic_query",
      "web_skill",
      "approval_required_tool",
      "artifact_delivery",
      "failure_tool",
    ])
  })
})
