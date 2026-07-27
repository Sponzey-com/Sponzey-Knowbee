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
