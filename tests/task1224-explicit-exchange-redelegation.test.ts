import { describe, expect, it } from "vitest"
import { createExplicitAgentExchange } from "../packages/core/src/contracts/explicit-agent-exchange.ts"
import type { StructuredTaskScope } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import type { SubAgentResultReview } from "../packages/core/src/agent/sub-agent-result-review.ts"
import {
  authorizeEvidenceBackedRedelegation,
  buildParentResultDisposition,
} from "../packages/core/src/orchestration/evidence-redelegation.ts"
import { readFileSync } from "node:fs"

const correctedScope: StructuredTaskScope = {
  goal: "Verify the missing source and return a corrected result.",
  intentType: "review",
  actionType: "sub_agent_feedback_revision",
  constraints: ["Use an authoritative source."],
  expectedOutputs: [],
  reasonCodes: ["missing_evidence"],
}

function review(
  verdict: SubAgentResultReview["verdict"],
  overrides: Partial<SubAgentResultReview> = {},
): SubAgentResultReview {
  return {
    accepted: verdict === "accept",
    status: verdict === "accept" ? "completed" : "needs_revision",
    verdict,
    parentIntegrationStatus: verdict === "accept"
      ? "ready_for_parent_integration"
      : "requires_revision",
    issues: [],
    missingItems: verdict === "accept" ? [] : ["authoritative source"],
    requiredChanges: verdict === "accept" ? [] : ["Add source evidence."],
    risksOrGaps: [],
    retryBudgetLimit: 2,
    repeatedFailure: false,
    canRetry: verdict !== "accept",
    ...overrides,
  }
}

function correction(verdict: SubAgentResultReview["verdict"] = "insufficient_evidence") {
  const disposition = buildParentResultDisposition({
    reviewId: "review:1",
    sourceResultReportId: "report:1",
    review: review(verdict),
    correctedScope,
    preservedEvidenceRefs: ["evidence:result:valid-claim"],
  })
  if (disposition.outcome !== "correct") throw new Error("correction expected")
  return disposition.correction
}

describe("task1224 explicit exchange and evidence-backed redelegation", () => {
  it("projects approved shared context as references without sharing memory objects", () => {
    const envelope = createExplicitAgentExchange({
      kind: "approved_shared_context",
      exchangeId: "exchange:1",
      contextId: "approved:1",
      senderAgentName: "마당쇠",
      receiverAgentName: "검증원",
      approvedByAgentName: "마당쇠",
      purpose: "Verify one claim.",
      scope: ["claim:1"],
      sourceRefs: ["evidence:source:1"],
      evaluatedAt: 1_000,
      expiresAt: 61_000,
    })

    expect(envelope).toMatchObject({
      kind: "approved_shared_context",
      artifactRef: "context:approved:1",
      memoryVisibility: "explicit_handoff_only",
      sourceRefs: ["evidence:source:1"],
    })
    expect(envelope.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(envelope).not.toHaveProperty("artifact")
  })

  it.each(["memory", "memoryStore", "sessionHistory", "transcript", "rawPrompt", "rawContext"])(
    "rejects direct agent context field %s",
    (field) => {
      expect(() => createExplicitAgentExchange({
        kind: "approved_shared_context",
        exchangeId: "exchange:blocked",
        contextId: "approved:blocked",
        senderAgentName: "마당쇠",
        receiverAgentName: "검증원",
        approvedByAgentName: "마당쇠",
        purpose: "Blocked direct context.",
        scope: ["claim:1"],
        sourceRefs: ["evidence:source:1"],
        evaluatedAt: 1_000,
        [field]: { secret: "must not cross" },
      } as never)).toThrow(/Direct agent context field is forbidden/)
    },
  )

  it("rejects untyped or expired approved shared context", () => {
    const base = {
      kind: "approved_shared_context" as const,
      exchangeId: "exchange:invalid-context",
      contextId: "approved:invalid",
      senderAgentName: "마당쇠",
      receiverAgentName: "검증원",
      approvedByAgentName: "마당쇠",
      purpose: "Reject invalid approval metadata.",
      scope: ["claim:1"],
      evaluatedAt: 2_000,
    }
    expect(() => createExplicitAgentExchange({
      ...base,
      sourceRefs: ["raw source text"],
    })).toThrow(/typed references only/)
    expect(() => createExplicitAgentExchange({
      ...base,
      sourceRefs: ["evidence:source:1"],
      expiresAt: 1_999,
    })).toThrow(/must not be expired/)
  })

  it("keeps an accepted child result on the parent integration path", () => {
    expect(buildParentResultDisposition({
      reviewId: "review:accepted",
      sourceResultReportId: "report:accepted",
      review: review("accept"),
      correctedScope,
      preservedEvidenceRefs: [],
    })).toEqual({
      outcome: "accept",
      reviewId: "review:accepted",
      sourceResultReportId: "report:accepted",
    })
  })

  it("builds an immutable correction package for an insufficient child result", () => {
    const result = correction()
    expect(result).toMatchObject({
      verdict: "insufficient_evidence",
      missingItems: ["authoritative source"],
      requiredChanges: ["Add source evidence."],
      preservedEvidenceRefs: ["evidence:result:valid-claim"],
    })
    expect(result.correctionFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/)
  })

  it("authorizes redelegation only when reason, review, evidence, and changed scope agree", () => {
    const decision = authorizeEvidenceBackedRedelegation({
      correction: correction(),
      parentAgentName: "마당쇠",
      previousTargetAgentName: "조사원",
      nextTargetAgentName: "검증원",
      reasonCode: "missing_evidence",
      reasonDetail: "The original result has no authoritative source.",
      reasonEvidenceRefs: ["evidence:review:missing-source"],
      originalScopeFingerprint: "sha256:original-scope",
    })
    expect(decision).toMatchObject({ ok: true, reasonCode: "missing_evidence" })
    if (decision.ok) expect(decision.authorizationReceiptId).toMatch(/^redelegation:[a-f0-9]{64}$/)
  })

  it("rejects a reason that contradicts the parent review", () => {
    expect(authorizeEvidenceBackedRedelegation({
      correction: correction("needs_revision"),
      parentAgentName: "마당쇠",
      previousTargetAgentName: "조사원",
      nextTargetAgentName: "검증원",
      reasonCode: "missing_evidence",
      reasonDetail: "Wrong reason for this verdict.",
      reasonEvidenceRefs: ["evidence:review:quality"],
      originalScopeFingerprint: "sha256:original-scope",
    })).toEqual({ ok: false, reasonCode: "redelegation_reason_review_mismatch" })
  })

  it("rejects an unchanged repeated strategy even when other fields are valid", () => {
    expect(authorizeEvidenceBackedRedelegation({
      correction: correction(),
      parentAgentName: "마당쇠",
      previousTargetAgentName: "조사원",
      nextTargetAgentName: "검증원",
      reasonCode: "missing_evidence",
      reasonDetail: "The same failure has no new evidence.",
      reasonEvidenceRefs: ["evidence:review:missing-source"],
      originalScopeFingerprint: "sha256:original-scope",
      previousStrategyFingerprint: "strategy:direct-source-v1",
      currentStrategyFingerprint: "strategy:direct-source-v1",
    })).toEqual({ ok: false, reasonCode: "redelegation_failure_unchanged" })
  })

  it("allows the same missing criterion when redelegation changes strategy", () => {
    expect(authorizeEvidenceBackedRedelegation({
      correction: correction(),
      parentAgentName: "마당쇠",
      previousTargetAgentName: "조사원",
      nextTargetAgentName: "검증원",
      reasonCode: "missing_evidence",
      reasonDetail: "Use a direct source instead of repeating search snippets.",
      reasonEvidenceRefs: ["evidence:review:missing-source"],
      originalScopeFingerprint: "sha256:original-scope",
      previousStrategyFingerprint: "strategy:web-search-v1",
      currentStrategyFingerprint: "strategy:direct-source-v2",
    })).toMatchObject({ ok: true, reasonCode: "missing_evidence" })
  })

  it("requires the runtime redelegation builder and control path to consume an authorization receipt", () => {
    const feedbackLoop = readFileSync(
      new URL("../packages/core/src/orchestration/feedback-loop.ts", import.meta.url),
      "utf8",
    )
    const control = readFileSync(
      new URL("../packages/core/src/orchestration/sub-session-control.ts", import.meta.url),
      "utf8",
    )
    expect(feedbackLoop).toMatch(/redelegationAuthorizationReceiptId:[\s\S]*?A valid redelegation authorization receipt is required/)
    expect(control).toMatch(/authorizeEvidenceBackedRedelegation\([\s\S]*?redelegationAuthorizationReceiptId: authorization\.authorizationReceiptId/)
    expect(control).toContain("previousStrategyFingerprints")
    expect(control).toContain("currentStrategyFingerprint: strategyFingerprint")
  })
})
