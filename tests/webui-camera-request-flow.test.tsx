import { describe, expect, it } from "vitest"
import {
  validateCameraChannelAcceptance,
} from "../packages/core/src/channels/camera-acceptance.ts"
import { getDefaultChannelSmokeScenarios } from "../packages/core/src/channels/smoke-runner.ts"
import { successfulCameraChannelObservation } from "./fixtures/camera-channel-acceptance.ts"

describe("WebUI camera request flow", () => {
  it("accepts the same canonical camera evidence chain as Telegram", () => {
    expect(
      validateCameraChannelAcceptance(
        successfulCameraChannelObservation("webui"),
      ),
    ).toEqual({ status: "passed", failures: [] })
  })

  it("accepts a safe awaiting-approval projection without dispatch or finalization", () => {
    const awaiting = successfulCameraChannelObservation("webui")
    awaiting.captureApproval.status = "awaiting"
    awaiting.capture = {
      dispatchCount: 0,
      status: "not_started",
    }
    awaiting.delivery = {
      status: "not_started",
      targetBound: false,
      artifactCount: 0,
      artifactBeforeFinal: false,
    }
    awaiting.completionReview = {
      performed: false,
      outcome: "pending",
    }
    awaiting.finalization = {
      reviewedFinalAnswer: false,
      finalAnswerCount: 0,
    }

    expect(validateCameraChannelAcceptance(awaiting)).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("reports approval rejection without dispatching or claiming completion", () => {
    const rejected = successfulCameraChannelObservation("webui")
    rejected.captureApproval.status = "rejected"
    rejected.capture = {
      dispatchCount: 0,
      status: "not_started",
    }
    rejected.delivery = {
      status: "not_started",
      targetBound: false,
      artifactCount: 0,
      artifactBeforeFinal: false,
    }
    rejected.completionReview = {
      performed: true,
      outcome: "cancelled",
    }

    expect(validateCameraChannelAcceptance(rejected)).toEqual({
      status: "passed",
      failures: [],
    })

    const falseSuccess = structuredClone(rejected)
    falseSuccess.completionReview.outcome = "complete"
    expect(validateCameraChannelAcceptance(falseSuccess).failures).toContain(
      "camera_completion_overstated",
    )
  })

  it("keeps artifact verification failure distinct from delivery success", () => {
    const failed = successfulCameraChannelObservation("webui")
    failed.capture.status = "failed"
    failed.capture.artifact = {
      ...failed.capture.artifact!,
      sizeBytes: 0,
      verification: "failed",
    }
    failed.delivery = {
      status: "not_started",
      targetBound: false,
      artifactCount: 0,
      artifactBeforeFinal: false,
    }
    failed.completionReview.outcome = "blocked"

    expect(validateCameraChannelAcceptance(failed)).toEqual({
      status: "passed",
      failures: [],
    })

    const falseSuccess = structuredClone(failed)
    falseSuccess.delivery.status = "delivered"
    falseSuccess.completionReview.outcome = "complete"
    expect(validateCameraChannelAcceptance(falseSuccess).failures).toEqual(
      expect.arrayContaining([
        "camera_delivery_without_verified_artifact",
        "camera_completion_overstated",
      ]),
    )
  })

  it("rejects an unsafe public projection and preserves five default WebUI scenarios", () => {
    const unsafe = successfulCameraChannelObservation("webui")
    unsafe.publicProjectionSafe = false
    expect(validateCameraChannelAcceptance(unsafe).failures).toContain(
      "camera_public_projection_unsafe",
    )

    const webUiScenarios = getDefaultChannelSmokeScenarios().filter(
      (scenario) => scenario.channel === "webui",
    )
    expect(webUiScenarios).toHaveLength(5)
  })
})
