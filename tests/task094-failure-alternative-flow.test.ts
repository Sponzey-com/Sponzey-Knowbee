import { describe, expect, it } from "vitest"
import {
  type RecoveryCandidateConstraintReview,
  decideStructuredFailureRecovery,
} from "../packages/core/src/contracts/failure-recovery-decision.ts"
import {
  type LlmCapabilitySelectionDecision,
  admitLlmCapabilitySelection,
  createLlmCapabilitySelectionReceipt,
} from "../packages/core/src/contracts/llm-capability-selection.ts"
import { runResultDiagnosisProvider } from "../packages/core/src/contracts/llm-diagnosis-provider.ts"
import type {
  LlmResultDiagnosisRecord,
  RecoveryCandidate,
} from "../packages/core/src/contracts/work-record.ts"

const diagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The cached value is stale and does not satisfy the current-value request.",
  sufficiency: "insufficient",
  missing_information: [],
  conflicts: ["The observed timestamp predates the requested current session."],
  risk: "low",
  risks: [],
  confidence: "high",
  recommended_action: "retry",
  reason: "A current direct source remains available through a changed strategy.",
}

const candidate: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "Use the current direct web source instead of the stale cache.",
  expected_benefit: "Retrieve direct evidence for the same requested current value.",
  risk: "low",
  changed_dimensions: ["strategy", "tool"],
  metadata: {
    capabilityId: "web.search",
    targetId: "agent:research",
    strategyFingerprint: "strategy:web-current:v2",
  },
}

const review: RecoveryCandidateConstraintReview = {
  candidateIndex: 0,
  safety: "allowed",
  permission: "allowed",
  resource: "available",
  evidenceRefs: ["evidence:policy-and-runtime:94"],
}

const snapshotFingerprint = `sha256:${"b".repeat(64)}` as const
const snapshot = {
  snapshotId: "snapshot:94",
  fingerprint: snapshotFingerprint,
  bindings: [{ capabilityId: "web.search", targetId: "agent:research", risk: "safe" as const }],
}

function selection(
  changedFromFailedStrategies = true,
  strategyFingerprint = "strategy:web-current:v2",
): LlmCapabilitySelectionDecision {
  return {
    schemaVersion: 1,
    runId: "work-94",
    capabilitySnapshotId: "snapshot:94",
    capabilitySnapshotFingerprint: snapshotFingerprint,
    comparedBindings: [{ capabilityId: "web.search", targetId: "agent:research" }],
    bindingAssessments: [
      {
        capabilityId: "web.search",
        targetId: "agent:research",
        roleFit: "fit",
        permission: "allowed",
        sideEffect: "read",
        evidenceQuality: "direct",
        dataExposure: "public",
        externalTransfer: false,
        cost: "low",
        strategyFingerprint,
        changedFromFailedStrategies,
        reason: "The direct source can retrieve current evidence for the unresolved goal.",
      },
    ],
    selectedBinding: { capabilityId: "web.search", targetId: "agent:research" },
    reason: "Select a current direct source instead of the failed cache strategy.",
  }
}

describe("Task 094 failed-result alternative flow", () => {
  it("diagnoses the failed result and cause through the LLM provider before recovery", async () => {
    const calls: unknown[] = []
    const result = await runResultDiagnosisProvider({
      provider: {
        diagnoseRequest: () => {
          throw new Error("Request diagnosis is not used in this result review.")
        },
        diagnoseResult: (input) => {
          calls.push(input)
          return diagnosis
        },
      },
      repairAttempted: false,
      diagnosisSubjectKind: "validation_result",
      ownerAgentName: "마당쇠",
      resultSummary: "The cache returned yesterday's value.",
      expectedOutput: "A currently observed value with its timestamp.",
      evidence: ["evidence:stale-cache:94"],
      risks: ["stale_result"],
      workId: "work-94",
      stepId: "verify",
    })

    expect(calls).toHaveLength(1)
    expect(result).toMatchObject({
      status: "valid",
      target: "result_diagnosis",
      diagnosis: { sufficiency: "insufficient", recommended_action: "retry" },
      receipt: {
        receiptId: "diagnosis:work-94:verify:result",
        subjectKind: "validation_result",
        recommendedAction: "retry",
      },
    })
  })

  it("does not authorize recovery from an invalid LLM failure diagnosis", async () => {
    const result = await runResultDiagnosisProvider({
      provider: {
        diagnoseRequest: () => ({}),
        diagnoseResult: () => "retry with another source",
      },
      repairAttempted: false,
      diagnosisSubjectKind: "error",
      ownerAgentName: "마당쇠",
      resultSummary: "The source failed.",
      expectedOutput: "A current value.",
      evidence: ["evidence:source-error:94"],
      risks: [],
      workId: "work-94",
      stepId: "verify",
    })

    expect(result).toMatchObject({
      status: "repair_required",
      target: "result_diagnosis",
    })
  })

  it("selects a non-duplicate changed method for the same unresolved goal", async () => {
    const subjectPayload = {
      ownerAgentName: "마당쇠",
      resultSummary: "The cache returned yesterday's value.",
      expectedOutput: "A currently observed value with its timestamp.",
      evidence: ["evidence:stale-cache:94"],
      risks: ["stale_result"],
      workId: "work-94",
      stepId: "verify",
    }
    const diagnosisResult = await runResultDiagnosisProvider({
      provider: { diagnoseRequest: () => ({}), diagnoseResult: () => diagnosis },
      repairAttempted: false,
      diagnosisSubjectKind: "validation_result",
      ...subjectPayload,
    })
    expect(diagnosisResult.status).toBe("valid")
    if (diagnosisResult.status !== "valid" || diagnosisResult.target !== "result_diagnosis") return

    const recovery = decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: diagnosisResult.diagnosis,
      receipt: diagnosisResult.receipt,
      failureDiagnosis: {
        failed_step_id: "verify",
        failure_reason: "cached_value_stale",
        failed_input_refs: ["result:cached-value"],
        failed_strategy: "Use the cached source value.",
        recoverable: true,
      },
      recoveryCandidates: [candidate],
      selectedCandidateIndex: 0,
      constraintReviews: [review],
      retryCount: 1,
      retryLimit: 3,
      currentAttemptSignature: "strategy:cache:v1",
      priorAttemptSignatures: ["strategy:provider-a:v1"],
      nextAttemptSignature: "strategy:web-current:v2",
    })
    expect(recovery).toMatchObject({
      state: "retry_ready",
      outcome: "retry",
      changedDimensions: ["strategy", "tool"],
      unresolvedScope: ["verify"],
      nextAttemptSignature: "strategy:web-current:v2",
    })

    const decision = selection()
    expect(
      admitLlmCapabilitySelection({
        runId: "work-94",
        userMethodSpecified: false,
        externalTransferAllowed: true,
        maxCost: "low",
        failedStrategyFingerprints: ["strategy:cache:v1"],
        capabilitySnapshot: snapshot,
        decision,
        receipt: createLlmCapabilitySelectionReceipt({
          receiptId: "selection:94",
          decision,
        }),
      }),
    ).toMatchObject({ status: "allowed", selectedBinding: snapshot.bindings[0] })
  })

  it("rejects a capability decision that repeats or cannot prove a changed failed strategy", () => {
    for (const decision of [selection(true, "strategy:cache:v1"), selection(false)]) {
      const result = admitLlmCapabilitySelection({
        runId: "work-94",
        userMethodSpecified: false,
        externalTransferAllowed: true,
        maxCost: "low",
        failedStrategyFingerprints: ["strategy:cache:v1"],
        capabilitySnapshot: snapshot,
        decision,
        receipt: createLlmCapabilitySelectionReceipt({
          receiptId: "selection:94",
          decision,
        }),
      })
      expect(result).toMatchObject({ status: "rejected" })
    }
  })
})
