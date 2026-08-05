import { describe, expect, it } from "vitest"
import {
  validateConversationControlRecoveryParity,
  type ConversationControlRecoveryObservation,
} from "../packages/core/src/channels/conversation-control-recovery.ts"

function paired(
  overrides: Partial<ConversationControlRecoveryObservation> = {},
): ConversationControlRecoveryObservation[] {
  return (["webui", "telegram"] as const).map((channel) => ({
    channel,
    scenarioId: "cancel-during-execution",
    interactionAdmission: "accepted",
    transitionCount: 1,
    executionStatus: "cancelled",
    deliveryStatus: "delivered",
    sideEffectCountAfterTerminal: 0,
    retry: {
      attempted: false,
    },
    restartDelivery: {
      pendingAtRestart: false,
      admissionReceiptPresent: false,
      attempted: false,
    },
    ...overrides,
  }))
}

describe("conversation control and recovery parity", () => {
  it("passes a single legal cancellation transition on both channels", () => {
    expect(validateConversationControlRecoveryParity(paired())).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it.each([
    "duplicate_rejected",
    "expired_rejected",
    "wrong_target_rejected",
    "post_cancel_rejected",
  ] as const)("accepts matching fail-closed interaction admission: %s", (interactionAdmission) => {
    expect(validateConversationControlRecoveryParity(paired({
      interactionAdmission,
      transitionCount: 0,
    }))).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("rejects unchanged retry strategy and restart delivery without admission", () => {
    const result = validateConversationControlRecoveryParity(paired({
      executionStatus: "blocked",
      retry: {
        attempted: true,
        previousStrategyFingerprint: "strategy:same",
        nextStrategyFingerprint: "strategy:same",
      },
      restartDelivery: {
        pendingAtRestart: true,
        admissionReceiptPresent: false,
        attempted: true,
      },
    }))

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "retry_strategy_unchanged:webui:cancel-during-execution",
      "restart_delivery_without_admission:webui:cancel-during-execution",
      "retry_strategy_unchanged:telegram:cancel-during-execution",
      "restart_delivery_without_admission:telegram:cancel-during-execution",
    ]))
  })

  it("rejects cross-channel outcome drift and side effects after cancellation", () => {
    const observations = paired()
    observations[0] = {
      ...observations[0]!,
      sideEffectCountAfterTerminal: 1,
    }
    observations[1] = {
      ...observations[1]!,
      deliveryStatus: "failed",
    }

    const result = validateConversationControlRecoveryParity(observations)
    expect(result.status).toBe("failed")
    expect(result.failures).toContain(
      "post_terminal_side_effect:webui:cancel-during-execution",
    )
    expect(result.failures).toContain(
      "control_outcome_mismatch:cancel-during-execution:delivery",
    )
  })
})
