import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  RESPONSE_FEEDBACK_KINDS,
  RESPONSE_STRATEGY_PROTECTED_INVARIANTS,
  RESPONSE_STRATEGY_TARGETS,
  applyAuthorizedResponseStrategyImprovement,
  authorizeResponseStrategyImprovement,
  verifyResponseFeedbackEvidence,
  type ResponseFeedbackEvidenceReceipt,
  type ResponseStrategyInvariantReceipt,
} from "../packages/core/src/contracts/response-strategy-improvement.ts"

function evidence(): ResponseFeedbackEvidenceReceipt[] {
  return RESPONSE_FEEDBACK_KINDS.map((kind, index) => ({
    kind,
    sessionId: "session:1365",
    runId: `run:${index}`,
    observedBehavior: `Observed ${kind} signal in the user interaction.`,
    evidenceRef: `feedback:${kind}:1365`,
    confidence: index === 0 ? "high" : "medium",
    diagnosedBy: "llm",
    observedAt: index + 1,
  }))
}

function invariants(): ResponseStrategyInvariantReceipt[] {
  return RESPONSE_STRATEGY_PROTECTED_INVARIANTS.map((invariant) => ({
    invariant,
    before: "preserved",
    after: "preserved",
    regressionPassed: true,
    evidenceRef: `regression:${invariant}:1365`,
  }))
}

function decision(overrides: Partial<Parameters<typeof authorizeResponseStrategyImprovement>[0]> = {}) {
  return authorizeResponseStrategyImprovement({
    feedback: verifyResponseFeedbackEvidence(evidence()),
    proposalTarget: "solution_path",
    writerTarget: "solution_path",
    invariants: invariants(),
    ...overrides,
  })
}

describe("task1365 response strategy improvement", () => {
  it("records every supported feedback kind as structured LLM-diagnosed evidence", () => {
    expect(verifyResponseFeedbackEvidence(evidence())).toEqual({
      status: "verified",
      evidenceRefs: RESPONSE_FEEDBACK_KINDS.map((kind) => `feedback:${kind}:1365`),
      feedbackKinds: RESPONSE_FEEDBACK_KINDS,
    })
  })

  it.each(RESPONSE_FEEDBACK_KINDS)("rejects incomplete %s feedback evidence", (kind) => {
    expect(verifyResponseFeedbackEvidence(evidence().map((receipt) => receipt.kind === kind ? { ...receipt, observedBehavior: "" } : receipt)))
      .toEqual({ status: "blocked", reasonCode: "feedback_evidence_invalid" })
  })

  it("rejects a single or entirely low-confidence ambiguous signal", () => {
    expect(verifyResponseFeedbackEvidence(evidence().slice(0, 1))).toEqual({ status: "blocked", reasonCode: "feedback_evidence_insufficient" })
    expect(verifyResponseFeedbackEvidence(evidence().map((receipt) => ({ ...receipt, confidence: "low" })))).toEqual({ status: "blocked", reasonCode: "feedback_evidence_ambiguous" })
  })

  it.each(RESPONSE_STRATEGY_TARGETS)("applies only to exact response strategy target %s", async (target) => {
    const apply = vi.fn(async () => target)
    const authorized = decision({ proposalTarget: target, writerTarget: target })
    await expect(applyAuthorizedResponseStrategyImprovement({ decision: authorized, apply }))
      .resolves.toEqual({ status: "applied", result: target })
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ target }))
  })

  it.each(RESPONSE_STRATEGY_TARGETS)("blocks cross-target writer for %s", async (proposalTarget) => {
    const writerTarget = RESPONSE_STRATEGY_TARGETS.find((target) => target !== proposalTarget) ?? "solution_path"
    const apply = vi.fn()
    const denied = decision({ proposalTarget, writerTarget })
    expect(denied).toEqual({ status: "blocked", reasonCode: "strategy_target_mismatch" })
    await applyAuthorizedResponseStrategyImprovement({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it("authorizes only after preserving every protected response invariant", () => {
    expect(decision()).toEqual(expect.objectContaining({
      status: "authorized",
      protectedInvariants: RESPONSE_STRATEGY_PROTECTED_INVARIANTS,
    }))
  })

  it.each(RESPONSE_STRATEGY_PROTECTED_INVARIANTS)("blocks missing protected invariant %s", (invariant) => {
    expect(decision({ invariants: invariants().filter((receipt) => receipt.invariant !== invariant) }))
      .toEqual({ status: "blocked", reasonCode: "protected_invariant_missing", invariant })
  })

  it.each(RESPONSE_STRATEGY_PROTECTED_INVARIANTS)("blocks weakened protected invariant %s", async (invariant) => {
    const apply = vi.fn()
    const denied = decision({ invariants: invariants().map((receipt) => receipt.invariant === invariant ? { ...receipt, after: "weakened" } : receipt) })
    expect(denied).toEqual({ status: "blocked", reasonCode: "protected_invariant_weakened", invariant })
    await applyAuthorizedResponseStrategyImprovement({ decision: denied, apply })
    expect(apply).not.toHaveBeenCalled()
  })

  it.each(RESPONSE_STRATEGY_PROTECTED_INVARIANTS)("blocks failed invariant regression %s", (invariant) => {
    expect(decision({ invariants: invariants().map((receipt) => receipt.invariant === invariant ? { ...receipt, regressionPassed: false } : receipt) }))
      .toEqual({ status: "blocked", reasonCode: "protected_invariant_regression_failed", invariant })
  })

  it("uses only injected structured evidence and invariant receipts", () => {
    const source = readFileSync(new URL("../packages/core/src/contracts/response-strategy-improvement.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|loadMemory|conversation|globalThis/u)
  })
})
