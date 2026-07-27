import { describe, expect, it } from "vitest"
import {
  type HighRiskEvidenceReviewInput,
  type SideEffectAuthorizationInput,
  authorizeSideEffect,
  reviewHighRiskEvidence,
} from "../packages/core/src/contracts/side-effect-evidence-gate.ts"

const authorization: SideEffectAuthorizationInput = {
  now: 100,
  workId: "work:91",
  effect: {
    effectId: "effect:send",
    kind: "external_transfer",
    target: "team@example.com",
    scope: ["report.pdf"],
    risk: "high",
    plannerActorId: "agent:planner",
    executorActorId: "adapter:mail",
  },
  policyReceipt: {
    receiptId: "receipt:policy:91",
    effectId: "effect:send",
    target: "team@example.com",
    scope: ["report.pdf"],
    decision: "approval_required",
    issuedAt: 90,
    expiresAt: 110,
  },
  approvalReceipt: {
    receiptId: "receipt:approval:91",
    effectId: "effect:send",
    target: "team@example.com",
    scope: ["report.pdf"],
    approverActorId: "user:owner",
    status: "approved",
    issuedAt: 95,
  },
}

const review: HighRiskEvidenceReviewInput = {
  workId: "work:91",
  effect: authorization.effect,
  verification: {
    kind: "independent_review",
    verifierActorId: "agent:reviewer",
    evidenceRefs: ["evidence:delivery-receipt"],
    passed: true,
  },
  sources: [
    {
      sourceRef: "source:direct-current",
      claimFingerprint: "claim:new",
      observedAt: 100,
      reliability: "high",
      directness: "direct",
    },
    {
      sourceRef: "source:old-indirect",
      claimFingerprint: "claim:old",
      observedAt: 80,
      reliability: "medium",
      directness: "indirect",
    },
  ],
  comparison: {
    sourceRefs: ["source:direct-current", "source:old-indirect"],
    outcome: "resolved",
    selectedSourceRef: "source:direct-current",
    uncertainty: null,
    reason: "The direct current source dominates on every comparison dimension.",
  },
}

describe("Task 091 side-effect and independent evidence gate", () => {
  it("authorizes an exact current target, scope, policy, and independent approval", () => {
    expect(authorizeSideEffect(authorization)).toEqual({
      status: "authorized",
      workId: "work:91",
      effectId: "effect:send",
      policyReceiptId: "receipt:policy:91",
      approvalReceiptId: "receipt:approval:91",
    })
  })

  it("rejects missing, stale, mismatched, or self-issued approval", () => {
    const approvalReceipt = authorization.approvalReceipt
    if (!approvalReceipt) throw new Error("Test fixture requires an approval receipt.")
    expect(authorizeSideEffect({ ...authorization, approvalReceipt: undefined })).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["effect_approval_missing"]),
    })
    expect(
      authorizeSideEffect({
        ...authorization,
        now: 111,
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["effect_policy_stale"]),
    })
    expect(
      authorizeSideEffect({
        ...authorization,
        approvalReceipt: { ...approvalReceipt, target: "other@example.com" },
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["effect_approval_scope_mismatch"]),
    })
    expect(
      authorizeSideEffect({
        ...authorization,
        approvalReceipt: {
          ...approvalReceipt,
          approverActorId: "agent:planner",
        },
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["effect_self_approval_forbidden"]),
    })
  })

  it("accepts high-risk completion only with independent or deterministic verification", () => {
    expect(reviewHighRiskEvidence(review)).toMatchObject({
      status: "verified",
      selectedSourceRef: "source:direct-current",
    })
    expect(
      reviewHighRiskEvidence({
        ...review,
        verification: { ...review.verification, verifierActorId: "agent:planner" },
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["high_risk_self_verification_forbidden"]),
    })
    expect(
      reviewHighRiskEvidence({
        ...review,
        verification: {
          kind: "deterministic_postcondition",
          evidenceRefs: ["evidence:remote-state"],
          passed: true,
        },
      }),
    ).toMatchObject({ status: "verified" })
  })

  it("preserves uncertainty when conflicting sources have no strict comparison winner", () => {
    const tied: HighRiskEvidenceReviewInput = {
      ...review,
      sources: review.sources.map((source) => ({
        ...source,
        observedAt: 100,
        reliability: "high",
        directness: "direct",
      })),
      comparison: {
        sourceRefs: review.comparison.sourceRefs,
        outcome: "unresolved",
        selectedSourceRef: null,
        uncertainty: "The direct sources conflict with equal comparison strength.",
        reason: "No source strictly dominates the other.",
      },
    }
    expect(reviewHighRiskEvidence(tied)).toEqual({
      status: "uncertain",
      workId: "work:91",
      sourceRefs: ["source:direct-current", "source:old-indirect"],
      uncertainty: "The direct sources conflict with equal comparison strength.",
    })
    expect(
      reviewHighRiskEvidence({
        ...tied,
        comparison: {
          ...tied.comparison,
          outcome: "resolved",
          selectedSourceRef: "source:direct-current",
          uncertainty: null,
        },
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["conflicting_evidence_not_resolved"]),
    })
  })
})
