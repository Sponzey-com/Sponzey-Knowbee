import { describe, expect, it } from "vitest"
import {
  validateConversationDeliveryParity,
  type ConversationDeliveryObservation,
} from "../packages/core/src/channels/conversation-delivery-parity.ts"

function paired(
  overrides: Partial<ConversationDeliveryObservation> = {},
): ConversationDeliveryObservation[] {
  return (["webui", "telegram"] as const).map((channel) => ({
    channel,
    scenarioId: "artifact-delivery",
    reviewedFinalAnswer: true,
    finalAnswerCount: 1,
    targetBound: true,
    deliveryReceiptPresent: true,
    artifactCount: 1,
    artifactBeforeFinal: true,
    duplicateSuppressed: true,
    publicProjectionSafe: true,
    terminalState: "delivered",
    ...overrides,
  }))
}

describe("conversation delivery parity", () => {
  it("passes one reviewed final result with ordered artifact delivery", () => {
    expect(validateConversationDeliveryParity(paired())).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("rejects duplicate final answers, wrong target, unsafe output, and bad artifact order", () => {
    const observations = paired()
    observations[0] = {
      ...observations[0]!,
      finalAnswerCount: 2,
      targetBound: false,
      publicProjectionSafe: false,
      artifactBeforeFinal: false,
    }

    expect(validateConversationDeliveryParity(observations).failures).toEqual(
      expect.arrayContaining([
        "final_answer_count_invalid:webui:artifact-delivery",
        "delivery_target_unbound:webui:artifact-delivery",
        "public_projection_unsafe:webui:artifact-delivery",
        "artifact_order_invalid:webui:artifact-delivery",
      ]),
    )
  })

  it("keeps delivery failure distinct and requires matching channel terminal states", () => {
    const observations = paired()
    observations[1] = {
      ...observations[1]!,
      terminalState: "failed",
      deliveryReceiptPresent: false,
    }

    const result = validateConversationDeliveryParity(observations)
    expect(result.status).toBe("failed")
    expect(result.failures).toContain(
      "delivery_outcome_mismatch:artifact-delivery",
    )
  })
})
