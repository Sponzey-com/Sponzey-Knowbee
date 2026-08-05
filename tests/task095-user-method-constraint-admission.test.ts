import { describe, expect, it } from "vitest"
import {
  type ExclusiveMethodFallbackInput,
  type UserMethodBoundaryInput,
  admitUserMethodBoundaries,
  decideExclusiveMethodFallback,
} from "../packages/core/src/contracts/user-method-constraint-admission.ts"

function boundaryInput(overrides: Partial<UserMethodBoundaryInput> = {}): UserMethodBoundaryInput {
  return {
    requestId: "request:95",
    methodId: "mcp.finance",
    targetId: "agent:finance",
    selectionReceiptId: "selection:95",
    review: {
      receiptId: "boundary-review:95",
      requestId: "request:95",
      methodId: "mcp.finance",
      targetId: "agent:finance",
      decisions: {
        safety: "allowed",
        privacy: "allowed",
        permission: "allowed",
        approval: "allowed",
        legal: "allowed",
      },
      evidenceRefs: ["policy:safety:95", "policy:privacy:95", "policy:legal:95"],
    },
    ...overrides,
  }
}

function alternative(methodId = "web.search") {
  return {
    methodId,
    targetId: "agent:finance",
    reason: "A direct public market source can answer the same request.",
    evidenceRefs: [`capability:${methodId}:available`],
  }
}

function fallbackInput(
  overrides: Partial<ExclusiveMethodFallbackInput> = {},
): ExclusiveMethodFallbackInput {
  return {
    requestId: "request:95",
    targetId: "agent:finance",
    exclusiveMethodIds: ["mcp.finance"],
    failedMethodId: "mcp.finance",
    failure: {
      receiptId: "failure:95",
      requestId: "request:95",
      methodId: "mcp.finance",
      targetId: "agent:finance",
      verified: true,
      reason: "The requested finance MCP is disconnected.",
      evidenceRefs: ["runtime:mcp.finance:disconnected"],
    },
    alternatives: [alternative()],
    ...overrides,
  }
}

describe("Task 095 user method constraint admission", () => {
  it("admits a selected method only when all five restriction boundaries allow it", () => {
    expect(admitUserMethodBoundaries(boundaryInput())).toEqual({
      status: "allowed",
      requestId: "request:95",
      methodId: "mcp.finance",
      targetId: "agent:finance",
      selectionReceiptId: "selection:95",
      boundaryReviewReceiptId: "boundary-review:95",
    })
  })

  it.each(["safety", "privacy", "permission", "approval", "legal"] as const)(
    "does not let the user-selected method bypass a denied %s boundary",
    (boundary) => {
      const value = boundaryInput()
      value.review.decisions[boundary] = "denied"
      expect(admitUserMethodBoundaries(value)).toEqual({
        status: "denied",
        requestId: "request:95",
        methodId: "mcp.finance",
        targetId: "agent:finance",
        deniedBoundaries: [boundary],
      })
    },
  )

  it("waits for every approval-required boundary without granting execution", () => {
    const value = boundaryInput()
    value.review.decisions.privacy = "approval_required"
    value.review.decisions.permission = "approval_required"
    expect(admitUserMethodBoundaries(value)).toEqual({
      status: "approval_required",
      requestId: "request:95",
      methodId: "mcp.finance",
      targetId: "agent:finance",
      requiredBoundaries: ["privacy", "permission"],
    })
  })

  it("rejects missing evidence and a review bound to another method or target", () => {
    const missingEvidence = boundaryInput()
    missingEvidence.review.evidenceRefs = []
    expect(admitUserMethodBoundaries(missingEvidence)).toMatchObject({
      status: "rejected",
      reasonCodes: ["boundary_review_invalid"],
    })
    const wrongScope = boundaryInput()
    wrongScope.review.methodId = "web.search"
    expect(admitUserMethodBoundaries(wrongScope)).toMatchObject({
      status: "rejected",
      reasonCodes: ["boundary_review_scope_mismatch"],
    })
  })

  it("reports verified exclusive-method failure and minimal alternatives while awaiting the user", () => {
    expect(decideExclusiveMethodFallback(fallbackInput())).toEqual({
      status: "awaiting_user",
      requestId: "request:95",
      failedMethodId: "mcp.finance",
      targetId: "agent:finance",
      failureReason: "The requested finance MCP is disconnected.",
      failureEvidenceRefs: ["runtime:mcp.finance:disconnected"],
      alternatives: fallbackInput().alternatives,
    })
  })

  it("authorizes only the exact alternative explicitly approved by the user", () => {
    expect(
      decideExclusiveMethodFallback(
        fallbackInput({
          switchApproval: {
            receiptId: "switch:95",
            requestId: "request:95",
            fromMethodId: "mcp.finance",
            toMethodId: "web.search",
            targetId: "agent:finance",
            actorType: "user",
            actorId: "user:owner",
            decision: "approved",
          },
        }),
      ),
    ).toEqual({
      status: "switch_authorized",
      requestId: "request:95",
      fromMethodId: "mcp.finance",
      toMethodId: "web.search",
      targetId: "agent:finance",
      approvalReceiptId: "switch:95",
    })
  })

  it("rejects unverified failure, excessive alternatives, and invalid switch approval", () => {
    const unverified = fallbackInput()
    unverified.failure.verified = false
    expect(decideExclusiveMethodFallback(unverified)).toMatchObject({
      status: "rejected",
      reasonCodes: ["exclusive_failure_invalid"],
    })
    expect(
      decideExclusiveMethodFallback(
        fallbackInput({
          alternatives: [
            ...fallbackInput().alternatives,
            alternative("skill.market"),
            alternative("yeonjang.browser"),
            alternative("api.market"),
          ],
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["alternatives_not_minimal"] })
    expect(
      decideExclusiveMethodFallback(
        fallbackInput({
          switchApproval: {
            receiptId: "switch:95",
            requestId: "request:95",
            fromMethodId: "mcp.finance",
            toMethodId: "web.search",
            targetId: "agent:finance",
            actorType: "system",
            actorId: "agent:knowbee",
            decision: "approved",
          },
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["switch_approval_actor_invalid"] })
  })

  it("rejects a denied switch or approval for an alternative that was not proposed", () => {
    const approval = {
      receiptId: "switch:95",
      requestId: "request:95",
      fromMethodId: "mcp.finance",
      toMethodId: "web.search",
      targetId: "agent:finance",
      actorType: "user" as const,
      actorId: "user:owner",
      decision: "denied" as const,
    }
    expect(
      decideExclusiveMethodFallback(fallbackInput({ switchApproval: approval })),
    ).toMatchObject({ status: "rejected", reasonCodes: ["switch_approval_denied"] })
    expect(
      decideExclusiveMethodFallback(
        fallbackInput({
          switchApproval: { ...approval, decision: "approved", toMethodId: "api.unlisted" },
        }),
      ),
    ).toMatchObject({ status: "rejected", reasonCodes: ["switch_approval_scope_mismatch"] })
  })
})
