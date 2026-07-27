import { describe, expect, it } from "vitest"
import {
  decideSideEffectRemediation,
  decideSideEffectVerification,
} from "../packages/core/src/runs/side-effect-verification.ts"

const fp = (char: string) => `sha256:${char.repeat(64)}` as const

describe("side-effect verification", () => {
  it("rejects a post-state expectation that differs from the authorized effect", () => {
    expect(
      decideSideEffectVerification({
        effect: {
          success: true,
          targetFingerprint: fp("a"),
          resultFingerprint: fp("b"),
          recordedAt: 10,
          receiptRef: "receipt:effect",
        },
        observation: {
          available: true,
          targetFingerprint: fp("a"),
          expectedStateFingerprint: fp("c"),
          observedStateFingerprint: fp("c"),
          capturedAt: 11,
          receiptRef: "receipt:observation",
        },
        authorizedExpectedStateFingerprint: fp("d"),
      }),
    ).toEqual({ verified: false, reasonCode: "authorized_expectation_mismatch" })
  })
  it("requires a matching post-state observation after the effect receipt", () => {
    expect(
      decideSideEffectVerification({
        effect: {
          success: true,
          targetFingerprint: fp("a"),
          resultFingerprint: fp("b"),
          recordedAt: 100,
          receiptRef: "effect:1",
        },
        observation: {
          available: true,
          targetFingerprint: fp("a"),
          expectedStateFingerprint: fp("c"),
          observedStateFingerprint: fp("c"),
          capturedAt: 101,
          receiptRef: "observation:1",
        },
      }),
    ).toMatchObject({ verified: true, receiptRefs: ["effect:1", "observation:1"] })
  })

  it.each([
    ["adapter_failed", { success: false }, {}],
    ["observation_unavailable", { success: true }, { available: false }],
    ["observation_target_mismatch", { success: true }, { targetFingerprint: fp("d") }],
    ["observation_stale", { success: true, recordedAt: 200 }, { capturedAt: 199 }],
    ["post_state_mismatch", { success: true }, { observedStateFingerprint: fp("d") }],
  ] as const)("rejects %s", (reasonCode, effectPatch, observationPatch) => {
    expect(
      decideSideEffectVerification({
        effect: {
          success: true,
          targetFingerprint: fp("a"),
          resultFingerprint: fp("b"),
          recordedAt: 100,
          receiptRef: "effect:1",
          ...effectPatch,
        },
        observation: {
          available: true,
          targetFingerprint: fp("a"),
          expectedStateFingerprint: fp("c"),
          observedStateFingerprint: fp("c"),
          capturedAt: 101,
          receiptRef: "observation:1",
          ...observationPatch,
        },
      }),
    ).toMatchObject({ verified: false, reasonCode })
  })

  it("selects compensation only when the adapter explicitly supports it", () => {
    expect(
      decideSideEffectRemediation({
        verified: false,
        reasonCode: "post_state_mismatch",
        compensationSupport: "reversible",
      }),
    ).toEqual({ action: "compensate", reasonCode: "side_effect_verification_failed" })
    expect(
      decideSideEffectRemediation({
        verified: false,
        reasonCode: "post_state_mismatch",
        compensationSupport: "irreversible",
      }),
    ).toEqual({ action: "manual_intervention", reasonCode: "side_effect_irreversible" })
    expect(
      decideSideEffectRemediation({
        verified: true,
        receiptRefs: ["a", "b"],
        compensationSupport: "reversible",
      }),
    ).toEqual({ action: "none", reasonCode: "side_effect_verified" })
  })
})
