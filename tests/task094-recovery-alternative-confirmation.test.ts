import { describe, expect, it } from "vitest"
import {
  type RecoveryAlternativeConfirmationInput,
  type RecoveryAlternativeConfirmationReceipt,
  admitRecoveryAlternativeConfirmation,
} from "../packages/core/src/contracts/recovery-alternative-confirmation.ts"

const now = 10_000

function confirmation(
  impact: RecoveryAlternativeConfirmationReceipt["impact"],
  overrides: Partial<RecoveryAlternativeConfirmationReceipt> = {},
): RecoveryAlternativeConfirmationReceipt {
  const authority = {
    user_intent: "user",
    safety_boundary: "safety_policy_owner",
    permission_scope: "permission_owner",
  } as const
  return {
    receiptId: `confirmation:${impact}`,
    workId: "work-94",
    recoveryReceiptId: "diagnosis:work-94:verify:result",
    nextAttemptSignature: "strategy:web-current:v2",
    impact,
    authority: authority[impact],
    decision: "approved",
    issuedAt: now - 100,
    expiresAt: now + 100,
    ...overrides,
  }
}

function input(
  overrides: Partial<RecoveryAlternativeConfirmationInput> = {},
): RecoveryAlternativeConfirmationInput {
  return {
    now,
    workId: "work-94",
    recoveryDecision: {
      state: "retry_ready",
      outcome: "retry",
      receiptId: "diagnosis:work-94:verify:result",
      selectedCandidate: {
        action_type: "retry",
        changed_input_or_strategy: "Use a current direct web source.",
        expected_benefit: "Obtain current evidence for the same requested value.",
        risk: "low",
        changed_dimensions: ["strategy", "tool"],
      },
      changedDimensions: ["strategy", "tool"],
      nextAttemptSignature: "strategy:web-current:v2",
      evidenceRefs: ["evidence:constraint-review:94"],
      partialResultRefs: [],
      unresolvedScope: ["verify"],
      userActions: [],
      stateTrace: [
        "diagnosing",
        "generating_candidates",
        "reviewing_constraints",
        "selecting_action",
        "retry_ready",
      ],
    },
    impactAssessment: {
      receiptId: "assessment:94",
      workId: "work-94",
      recoveryReceiptId: "diagnosis:work-94:verify:result",
      nextAttemptSignature: "strategy:web-current:v2",
      impacts: [],
      reason: "The alternative preserves intent and does not alter safety or permission scope.",
    },
    confirmations: [],
    ...overrides,
  }
}

describe("Task 094 recovery alternative confirmation", () => {
  it("admits a changed alternative with no declared impact without unnecessary confirmation", () => {
    expect(admitRecoveryAlternativeConfirmation(input())).toEqual({
      status: "allowed",
      workId: "work-94",
      recoveryReceiptId: "diagnosis:work-94:verify:result",
      impactAssessmentReceiptId: "assessment:94",
      confirmationReceiptIds: [],
      nextAttemptSignature: "strategy:web-current:v2",
    })
  })

  it.each([
    ["user_intent", "user"],
    ["safety_boundary", "safety_policy_owner"],
    ["permission_scope", "permission_owner"],
  ] as const)("requires a %s confirmation from %s", (impact, authority) => {
    const assessed = input({
      impactAssessment: { ...input().impactAssessment, impacts: [impact] },
    })
    expect(admitRecoveryAlternativeConfirmation(assessed)).toEqual({
      status: "confirmation_required",
      workId: "work-94",
      recoveryReceiptId: "diagnosis:work-94:verify:result",
      required: [{ impact, authority }],
    })
  })

  it("admits only after every affected boundary has an exact current approval", () => {
    const impacts = ["user_intent", "safety_boundary", "permission_scope"] as const
    expect(
      admitRecoveryAlternativeConfirmation(
        input({
          impactAssessment: { ...input().impactAssessment, impacts: [...impacts] },
          confirmations: impacts.map((impact) => confirmation(impact)),
        }),
      ),
    ).toMatchObject({
      status: "allowed",
      confirmationReceiptIds: impacts.map((impact) => `confirmation:${impact}`),
    })
  })

  it("rejects denied, expired, wrong-authority, and wrong-scope confirmations", () => {
    const assessed = input({
      impactAssessment: { ...input().impactAssessment, impacts: ["user_intent"] },
    })
    expect(
      admitRecoveryAlternativeConfirmation({
        ...assessed,
        confirmations: [confirmation("user_intent", { decision: "denied" })],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["confirmation_denied"] })
    expect(
      admitRecoveryAlternativeConfirmation({
        ...assessed,
        confirmations: [confirmation("user_intent", { expiresAt: now - 1 })],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["confirmation_stale"] })
    expect(
      admitRecoveryAlternativeConfirmation({
        ...assessed,
        confirmations: [confirmation("user_intent", { authority: "permission_owner" })],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["confirmation_authority_mismatch"] })
    expect(
      admitRecoveryAlternativeConfirmation({
        ...assessed,
        confirmations: [confirmation("user_intent", { workId: "work:other" })],
      }),
    ).toMatchObject({ status: "rejected", reasonCodes: ["confirmation_scope_mismatch"] })
  })

  it("rejects an assessment that is not bound to a ready changed recovery decision", () => {
    expect(
      admitRecoveryAlternativeConfirmation(
        input({
          impactAssessment: {
            ...input().impactAssessment,
            nextAttemptSignature: "strategy:unbound:v3",
          },
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["impact_assessment_scope_mismatch"] })
    expect(
      admitRecoveryAlternativeConfirmation(
        input({
          recoveryDecision: {
            ...input().recoveryDecision,
            changedDimensions: ["input"],
          },
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["alternative_method_not_changed"] })
  })
})
