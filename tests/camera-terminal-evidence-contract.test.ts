import { describe, expect, it } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  buildCompletionReviewContextReceipt,
  evaluateCompletionReviewCriterionGate,
  evaluateCompletionReviewTerminalGate,
  parseCompletionReviewResult,
  type CompletionReviewResult,
} from "../packages/core/src/agent/completion-review.ts"
import { buildCanonicalCompletionOutcomeDescriptor } from "../packages/core/src/runs/canonical-finalization-lifecycle.ts"

const evidenceRef = `tool-result:tool:${"a".repeat(64)}`
const successfulTools = [{
  toolName: "camera_permission_probe",
  output: "camera permission denied",
  evidenceSource: {
    sourceKind: "tool" as const,
    sourceRef: evidenceRef,
    trustClass: "untrusted_external" as const,
    instructionIsolation: "data_only" as const,
  },
}]
const contextReceipt = buildCompletionReviewContextReceipt({
  originalRequest: "Take one camera photo.",
  latestAssistantMessage: "The camera permission is denied.",
  successfulTools,
})
const terminalEvidence = {
  blockerEvidenceRefs: [evidenceRef],
  evaluatedAlternativeEvidenceRefs: [evidenceRef],
  excludedCandidateEvidenceRefs: [],
}
const assessments = COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
  criterionKey,
  applicable: true,
  verdict: "unsatisfied" as const,
  evidenceRefs: [evidenceRef],
  uncertainty: "",
  reason: "The requested photo was not produced.",
}))
const incompleteState = {
  executionSatisfied: false,
  deliveryRequired: true,
  deliverySatisfied: false,
  completionSatisfied: false,
  interpretationStatus: "satisfied" as const,
  executionStatus: "pending" as const,
  deliveryStatus: "pending" as const,
  recoveryStatus: "pending" as const,
  blockingReasons: ["required tool evidence missing"],
  checklist: {
    items: [
      { key: "request" as const, status: "completed" as const },
      { key: "execution" as const, status: "pending" as const },
      { key: "delivery" as const, status: "pending" as const },
      { key: "completion" as const, status: "pending" as const },
    ],
    completedCount: 1,
    actionableCount: 4,
    pendingCount: 3,
  },
}

function terminalReview(
  status: "blocked" | "paths_exhausted",
  evidence = terminalEvidence,
): CompletionReviewResult {
  return {
    status,
    summary: "The request cannot complete in the current state.",
    reason: "Camera evidence proves the remaining limitation.",
    followupEvidenceRefs: [],
    remainingItems: ["Capture and deliver one photo."],
    criterionAssessments: assessments,
    contextReceipt,
    terminalEvidence: evidence,
  }
}

describe("camera terminal evidence contract", () => {
  it("parses paths_exhausted with bounded evidence fields", () => {
    const parsed = parseCompletionReviewResult(JSON.stringify({
      status: "paths_exhausted",
      summary: "No current candidate can capture the photo.",
      reason: "Every supplied candidate has verified exclusion evidence.",
      followup_evidence_refs: [],
      followup_execution_mode: "",
      followup_required_tool_names: [],
      followup_target_refs: [],
      remaining_items: ["Capture and deliver one photo."],
      blocker_evidence_refs: [],
      evaluated_alternative_evidence_refs: [evidenceRef],
      excluded_candidate_evidence_refs: [evidenceRef],
      criterion_assessments: assessments.map((item) => ({
        criterion_key: item.criterionKey,
        applicable: item.applicable,
        verdict: item.verdict,
        evidence_refs: item.evidenceRefs,
        uncertainty: item.uncertainty,
        reason: item.reason,
      })),
      condition_assessments: [],
    }))

    expect(parsed).toMatchObject({
      status: "paths_exhausted",
      terminalEvidence: {
        evaluatedAlternativeEvidenceRefs: [evidenceRef],
        excludedCandidateEvidenceRefs: [evidenceRef],
      },
    })
  })

  it("requires verified blocker evidence without claiming every candidate was excluded", () => {
    expect(evaluateCompletionReviewTerminalGate({
      review: terminalReview("blocked"),
      allowedEvidenceRefs: [evidenceRef],
    })).toEqual({ ok: true })
    expect(evaluateCompletionReviewTerminalGate({
      review: terminalReview("blocked", {
        ...terminalEvidence,
        blockerEvidenceRefs: [],
      }),
      allowedEvidenceRefs: [evidenceRef],
    })).toEqual({
      ok: false,
      reasonCode: "completion_review_blocker_evidence_missing",
    })
  })

  it("requires complete current-scope candidate exclusion for paths_exhausted", () => {
    expect(evaluateCompletionReviewTerminalGate({
      review: terminalReview("paths_exhausted", {
        blockerEvidenceRefs: [],
        evaluatedAlternativeEvidenceRefs: [evidenceRef],
        excludedCandidateEvidenceRefs: [evidenceRef],
      }),
      allowedEvidenceRefs: [evidenceRef],
    })).toEqual({ ok: true })
    expect(evaluateCompletionReviewTerminalGate({
      review: terminalReview("paths_exhausted", {
        blockerEvidenceRefs: [],
        evaluatedAlternativeEvidenceRefs: [evidenceRef],
        excludedCandidateEvidenceRefs: [],
      }),
      allowedEvidenceRefs: [evidenceRef],
    })).toEqual({
      ok: false,
      reasonCode: "completion_review_candidate_exclusion_incomplete",
    })
  })

  it("records blocked and exhausted as different canonical terminal events", () => {
    const blocked = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-camera-blocked",
      review: terminalReview("blocked"),
      requiresLlmResultDiagnosis: true,
      expectedLlmDiagnosisContext: contextReceipt,
      state: incompleteState,
      application: {
        kind: "stop",
        summary: "Camera permission is blocked.",
        reason: "Permission denied.",
      },
      preview: "The camera permission is denied.",
    })
    const exhausted = buildCanonicalCompletionOutcomeDescriptor({
      runId: "run-camera-exhausted",
      review: terminalReview("paths_exhausted", {
        blockerEvidenceRefs: [],
        evaluatedAlternativeEvidenceRefs: [evidenceRef],
        excludedCandidateEvidenceRefs: [evidenceRef],
      }),
      requiresLlmResultDiagnosis: true,
      expectedLlmDiagnosisContext: contextReceipt,
      state: incompleteState,
      application: {
        kind: "stop",
        summary: "All camera paths are exhausted.",
        reason: "All supplied candidates were excluded.",
      },
      preview: "No current camera path can complete the request.",
    })

    if (!blocked.ok) throw new Error(blocked.reasonCode)
    if (!exhausted.ok) throw new Error(exhausted.reasonCode)
    expect(blocked).toMatchObject({
      ok: true,
      descriptor: {
        event: "RESULT_BLOCKED",
        receipt: { kind: "blocker", terminalCause: { outcomeKind: "blocked" } },
      },
    })
    expect(exhausted).toMatchObject({
      ok: true,
      descriptor: {
        event: "PATHS_EXHAUSTED",
        receipt: { kind: "exhaustion", terminalCause: { outcomeKind: "exhausted" } },
      },
    })
  })

  it("rejects camera completion without successful required Tool evidence", () => {
    expect(evaluateCompletionReviewCriterionGate({
      review: {
        ...terminalReview("blocked"),
        status: "complete",
        remainingItems: [],
      },
      allowedEvidenceRefs: [evidenceRef],
      requiresSuccessfulToolEvidence: true,
      successfulToolEvidenceRefs: [],
    })).toEqual({
      ok: false,
      reasonCode: "completion_review_required_tool_evidence_missing",
    })
  })
})
