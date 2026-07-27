import { describe, expect, it, vi } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  buildCompletionReviewContextReceipt,
  buildCompletionReviewExpectedConditions,
} from "../packages/core/src/agent/completion-review.ts"
import {
  buildCanonicalCompletionOutcomeDescriptor,
  buildCanonicalCancellationDescriptor,
  buildCanonicalDeliveryDescriptor,
  buildCanonicalPolicyBlockedDescriptor,
  buildCanonicalPolicyInputRequiredDescriptor,
  buildCanonicalRecoveredDeliveryDescriptor,
  recordCanonicalFinalizationTransition,
} from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"

const completeState = {
  executionSatisfied: true,
  deliveryRequired: false,
  deliverySatisfied: true,
  completionSatisfied: true,
  interpretationStatus: "satisfied" as const,
  executionStatus: "satisfied" as const,
  deliveryStatus: "not_required" as const,
  recoveryStatus: "settled" as const,
  blockingReasons: [],
  checklist: {
    items: [
      { key: "request" as const, status: "completed" as const },
      { key: "execution" as const, status: "completed" as const },
      { key: "delivery" as const, status: "not_required" as const },
      { key: "completion" as const, status: "completed" as const },
    ],
    completedCount: 3,
    actionableCount: 3,
    pendingCount: 0,
  },
}

describe("canonical finalization lifecycle", () => {
  it("recovers a committed delivery transition without retaining ledger keys", () => {
    const built = buildCanonicalRecoveredDeliveryDescriptor({
      runId: "run-1",
      finalOutcome: "partial",
      committedLedgerEventId: "secret-ledger-event",
      deliveryKey: "secret-delivery-key",
      idempotencyKey: "secret-idempotency-key",
    })
    expect(built).toMatchObject({
      ok: true,
      descriptor: { event: "REPORT_DELIVERED", finalOutcome: "partial" },
    })
    expect(JSON.stringify(built)).not.toContain("secret-ledger-event")
    expect(JSON.stringify(built)).not.toContain("secret-delivery-key")
    expect(JSON.stringify(built)).not.toContain("secret-idempotency-key")
  })

  it("builds a policy input-required receipt without storing raw user input", () => {
    const raw = "private approval and user request"
    const built = buildCanonicalPolicyInputRequiredDescriptor({
      runId: "run-1",
      reasonCode: "approval_required",
      policyFingerprint: `sha256:${"a".repeat(64)}`,
      capabilityRefs: ["capability:tool-a"],
      waitingKind: "approval",
    })

    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(built.descriptor.event).toBe("INPUT_REQUIRED")
    expect(built.descriptor.waitingKind).toBe("approval")
    expect(JSON.stringify(built.descriptor)).not.toContain(raw)
    expect(built.descriptor.receipt.evidenceRefs).toContain("capability:tool-a")
    expect(built.descriptor.receipt.evidenceRefs).toContain(
      "policy-reason:approval_required",
    )
  })

  it("forwards the policy waiting kind through the canonical transition port", () => {
    const built = buildCanonicalPolicyInputRequiredDescriptor({
      runId: "run-1",
      reasonCode: "missing_user_input",
      policyFingerprint: `sha256:${"b".repeat(64)}`,
      capabilityRefs: [],
      waitingKind: "user_input",
    })
    if (!built.ok) throw new Error("descriptor expected")
    const applyTransition = vi.fn(() => ({ status: "applied" }))

    expect(recordCanonicalFinalizationTransition(built.descriptor, {
      issueReceipt: () => ({ issued: true }),
      loadReceipt: () => undefined,
      applyTransition,
    })).toEqual({ ok: true })
    expect(applyTransition).toHaveBeenCalledWith(expect.objectContaining({
      event: "INPUT_REQUIRED",
      waitingKind: "user_input",
    }))
  })

  it("rejects policy blocking while a safe alternative remains", () => {
    const policyFingerprint = `sha256:${"a".repeat(64)}` as const
    expect(buildCanonicalPolicyBlockedDescriptor({
      runId: "run-1",
      reasonCode: "exclusive_method_unavailable",
      policyFingerprint,
      capabilityRefs: ["capability:web"],
      safeAlternativesExhausted: false,
    })).toEqual({ ok: false, reasonCode: "canonical_policy_alternatives_not_exhausted" })
    expect(buildCanonicalPolicyBlockedDescriptor({
      runId: "run-1",
      reasonCode: "exclusive_method_unavailable",
      policyFingerprint,
      capabilityRefs: ["capability:web"],
      safeAlternativesExhausted: true,
    })).toMatchObject({ ok: true, descriptor: { event: "POLICY_BLOCKED" } })
  })

  it("requires run-scoped cancellation evidence and does not persist the raw token", () => {
    expect(buildCanonicalCancellationDescriptor({
      runId: "run-1",
      cancellationKind: "runtime_abort",
      cancellationTokenId: "root-run:other",
      signalAborted: true,
    })).toEqual({ ok: false, reasonCode: "canonical_cancellation_scope_mismatch" })
    expect(buildCanonicalCancellationDescriptor({
      runId: "run-1",
      cancellationKind: "runtime_abort",
      cancellationTokenId: "root-run:run-1",
      signalAborted: false,
    })).toEqual({ ok: false, reasonCode: "canonical_cancellation_abort_evidence_missing" })
    const built = buildCanonicalCancellationDescriptor({
      runId: "run-1",
      cancellationKind: "user_requested",
      cancellationTokenId: "root-run:run-1",
      signalAborted: false,
    })
    expect(built).toMatchObject({ ok: true, descriptor: { event: "USER_CANCELLED" } })
    expect(JSON.stringify(built)).not.toContain("root-run:run-1")
  })

  it("builds a verification receipt from completed review evidence without raw result text", () => {
    const raw = "private final result"
    const built = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-1",
      review: { status: "complete", summary: "verified", reason: "done", remainingItems: [] },
      state: completeState,
      application: { kind: "complete", summary: "done", persistedText: raw, statusText: "done" },
      preview: raw,
    })

    expect(built).toMatchObject({ ok: true, descriptor: { event: "ALL_CRITERIA_VERIFIED" } })
    expect(JSON.stringify(built)).not.toContain(raw)
  })

  it("rejects a contradictory complete result instead of claiming path exhaustion", () => {
    expect(buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-1",
      review: null,
      state: {
        ...completeState,
        completionSatisfied: false,
        checklist: { ...completeState.checklist, pendingCount: 1 },
      },
      application: { kind: "complete", summary: "done", persistedText: "result", statusText: "done" },
      preview: "result",
    })).toEqual({ ok: false, reasonCode: "canonical_completion_state_contradiction" })
  })

  it("requires an authorized exhaustion path and maps awaiting-user explicitly", () => {
    const exhausted = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-1",
      review: null,
      state: completeState,
      application: { kind: "stop", summary: "stop", reason: "no safe path" },
      preview: "partial",
    })
    const awaiting = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-2",
      review: null,
      state: completeState,
      application: { kind: "awaiting_user", summary: "need input", reason: "missing value" },
      preview: "question",
    })
    expect(exhausted).toEqual({
      ok: false,
      reasonCode: "canonical_exhaustion_authorization_missing",
    })
    expect(awaiting).toMatchObject({ ok: true, descriptor: { event: "INPUT_REQUIRED" } })
  })

  it("authorizes path exhaustion only from an evidence-bound LLM paths-exhausted review", () => {
    const successfulTools = [{
      toolName: "agent_reply",
      output: "No permitted execution path was found.",
      evidenceSource: {
        sourceKind: "tool" as const,
        sourceRef: `tool-result:tool:${"a".repeat(64)}`,
        trustClass: "untrusted_external" as const,
        instructionIsolation: "data_only" as const,
      },
    }]
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest: "Run the explicitly requested unavailable method.",
      latestAssistantMessage: "The requested method could not be executed.",
      successfulTools,
      completionConditions: ["Execute the explicitly requested method."],
    })
    const expectedConditions = buildCompletionReviewExpectedConditions([
      "Execute the explicitly requested method.",
    ])
    const evidenceRef = successfulTools[0]!.evidenceSource!.sourceRef
    const built = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-llm-exhausted",
      review: {
        status: "paths_exhausted",
        summary: "No materially different permitted path remains.",
        reason: "The explicit method is unavailable.",
        remainingItems: ["The requested method was not executed."],
        followupEvidenceRefs: [],
        criterionAssessments: COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
          criterionKey,
          applicable: true,
          verdict: "unsatisfied",
          evidenceRefs: [evidenceRef],
          uncertainty: "",
          reason: "The requested method was not executed.",
        })),
        conditionAssessments: expectedConditions.map((condition) => ({
          conditionId: condition.conditionId,
          verdict: "unsatisfied",
          evidenceRefs: [evidenceRef],
          uncertainty: "",
          reason: "The expected execution condition was not met.",
        })),
        contextReceipt,
        terminalEvidence: {
          blockerEvidenceRefs: [],
          evaluatedAlternativeEvidenceRefs: [evidenceRef],
          excludedCandidateEvidenceRefs: [evidenceRef],
        },
      },
      requiresLlmResultDiagnosis: true,
      expectedLlmDiagnosisContext: contextReceipt,
      expectedLlmDiagnosisConditions: expectedConditions,
      state: {
        ...completeState,
        completionSatisfied: false,
        checklist: { ...completeState.checklist, pendingCount: 1 },
      },
      application: {
        kind: "stop",
        summary: "No permitted path remains.",
        reason: "The explicit method is unavailable.",
      },
      preview: "The requested method could not be executed.",
    })

    expect(built).toMatchObject({
      ok: true,
      descriptor: {
        event: "PATHS_EXHAUSTED",
        receipt: {
          kind: "exhaustion",
          terminalCause: {
            originStage: "result_diagnosis",
            outcomeKind: "exhausted",
            reasonCode: "solution_paths_exhausted",
            safeAlternativesExhausted: true,
          },
        },
      },
    })
  })

  it("accepts only committed or idempotently committed delivery and stores fingerprints", () => {
    const raw = "user-visible final response"
    const delivered = buildCanonicalDeliveryDescriptor({
      runId: "run-1",
      source: "telegram",
      sessionId: "secret-session",
      text: raw,
      textSource: "llm_generated",
      finalOutcome: "succeeded",
      delivery: {
        status: "delivered",
        deliveryKey: "delivery-secret",
        idempotencyKey: "idempotency-secret",
      },
    })
    expect(delivered).toMatchObject({ ok: true, descriptor: { event: "REPORT_DELIVERED" } })
    expect(JSON.stringify(delivered)).not.toContain(raw)
    expect(JSON.stringify(delivered)).not.toContain("secret-session")
    expect(buildCanonicalDeliveryDescriptor({
      runId: "run-1",
      source: "telegram",
      sessionId: "session",
      text: raw,
      textSource: "llm_generated",
      finalOutcome: "succeeded",
      delivery: {
        status: "delivery_failed",
        deliveryKey: "delivery",
        idempotencyKey: "idempotency",
      },
    })).toEqual({ ok: false, reasonCode: "canonical_delivery_not_committed:delivery_failed" })
  })

  it("treats an exact consumed receipt replay as idempotent", () => {
    const built = buildCanonicalDeliveryDescriptor({
      runId: "run-1",
      source: "webui",
      sessionId: "session",
      text: "done",
      textSource: "llm_generated",
      finalOutcome: "partial",
      delivery: { status: "duplicate_suppressed", deliveryKey: "key", idempotencyKey: "idem", existingEventId: "event-1" },
    })
    if (!built.ok) throw new Error("descriptor expected")
    const applyTransition = vi.fn()
    expect(recordCanonicalFinalizationTransition(built.descriptor, {
      issueReceipt: () => ({ issued: false, reasonCode: "duplicate" }),
      loadReceipt: () => ({ ...built.descriptor.receipt, consumedRevision: 6 }),
      applyTransition,
    })).toEqual({ ok: true })
    expect(applyTransition).not.toHaveBeenCalled()
  })
})
