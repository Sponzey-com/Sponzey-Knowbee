import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  createLlmDiagnosisReceipt,
  decideStructuredFailureRecovery,
  transitionFailureRecovery,
  type FailureDiagnosis,
  type LlmResultDiagnosisRecord,
  type RecoveryCandidate,
  type RecoveryStopCondition,
} from "../packages/core/src/contracts/index.ts"

const subjectPayload = {
  workId: "work-1",
  failedStepId: "step-1",
  evidenceRefs: ["error-event-1"],
}
const failure: FailureDiagnosis = {
  failed_step_id: "step-1",
  failure_reason: "The primary tool is unavailable.",
  failed_input_refs: ["input:v1"],
  failed_strategy: "primary-tool",
  recoverable: true,
}
const candidate: RecoveryCandidate = {
  action_type: "retry",
  changed_input_or_strategy: "fallback-tool",
  expected_benefit: "Uses an available implementation.",
  risk: "low",
  changed_dimensions: ["tool"],
  metadata: { candidate_id: "candidate-1" },
}

function diagnosis(action: LlmResultDiagnosisRecord["recommended_action"]): LlmResultDiagnosisRecord {
  return {
    diagnosis_summary: "The failed step can be recovered with a changed tool.",
    sufficiency: action === "final_report" ? "sufficient" : action === "partial_report" ? "partial" : "insufficient",
    missing_information: [],
    conflicts: [],
    risk: "low",
    risks: [],
    confidence: "high",
    recommended_action: action,
    reason: "The selected action follows the failure evidence.",
  }
}

function receipt(value: LlmResultDiagnosisRecord) {
  return createLlmDiagnosisReceipt({
    receiptId: `receipt-${value.recommended_action}`,
    target: "result_diagnosis",
    subjectKind: "error",
    subjectPayload,
    diagnosis: value,
  })
}

function allowedReview() {
  return {
    candidateIndex: 0,
    safety: "allowed" as const,
    permission: "allowed" as const,
    resource: "available" as const,
    evidenceRefs: ["capability-snapshot-1", "permission-snapshot-1"],
  }
}

describe("task1216 structured failure recovery decision", () => {
  it("authorizes a changed, evidence-reviewed retry through an exact LLM receipt", () => {
    const resultDiagnosis = diagnosis("retry")
    expect(decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [candidate],
      selectedCandidateIndex: 0,
      constraintReviews: [allowedReview()],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [],
      nextAttemptSignature: "fallback-tool:input-v1",
    })).toMatchObject({
      state: "retry_ready",
      outcome: "retry",
      changedDimensions: ["tool"],
      receiptId: "receipt-retry",
      stateTrace: [
        "diagnosing",
        "generating_candidates",
        "reviewing_constraints",
        "selecting_action",
        "retry_ready",
      ],
    })
  })

  it("rejects missing or mismatched receipts and candidates without an actual changed dimension", () => {
    const resultDiagnosis = diagnosis("retry")
    const base = {
      subjectPayload,
      diagnosis: resultDiagnosis,
      failureDiagnosis: failure,
      recoveryCandidates: [candidate],
      selectedCandidateIndex: 0,
      constraintReviews: [allowedReview()],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [] as string[],
      nextAttemptSignature: "fallback-tool:input-v1",
    }
    expect(() => decideStructuredFailureRecovery({ ...base, receipt: undefined })).toThrow(/receipt is required/i)
    expect(() => decideStructuredFailureRecovery({
      ...base,
      receipt: receipt(resultDiagnosis),
      subjectPayload: { ...subjectPayload, failedStepId: "changed" },
    })).toThrow(/subject fingerprint/i)
    expect(() => decideStructuredFailureRecovery({
      ...base,
      receipt: receipt(resultDiagnosis),
      recoveryCandidates: [{ ...candidate, changed_dimensions: [] }],
    })).toThrow(/changed dimension/i)
  })

  it("rejects unreviewed constraints, denied candidates, and duplicate attempt signatures", () => {
    const resultDiagnosis = diagnosis("retry")
    const base = {
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [candidate],
      selectedCandidateIndex: 0,
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: ["fallback-tool:input-v0"],
      nextAttemptSignature: "fallback-tool:input-v1",
    }
    expect(() => decideStructuredFailureRecovery({ ...base, constraintReviews: [] })).toThrow(/constraint review/i)
    expect(() => decideStructuredFailureRecovery({
      ...base,
      constraintReviews: [{ ...allowedReview(), safety: "denied" as const }],
    })).toThrow(/not allowed/i)
    expect(() => decideStructuredFailureRecovery({
      ...base,
      constraintReviews: [allowedReview()],
      nextAttemptSignature: "fallback-tool:input-v0",
    })).toThrow(/duplicate attempt/i)
  })

  it.each([
    "input",
    "strategy",
    "tool",
    "delegation_target",
    "permission",
    "scope",
    "validation_method",
  ] as const)("accepts a justified retry that changes the %s dimension", (dimension) => {
    const resultDiagnosis = diagnosis("retry")
    const changedCandidate = { ...candidate, changed_dimensions: [dimension] }
    expect(decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [changedCandidate],
      selectedCandidateIndex: 0,
      constraintReviews: [allowedReview()],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [],
      nextAttemptSignature: `fallback:${dimension}:input-v1`,
    }).changedDimensions).toEqual([dimension])
  })

  it("authorizes a changed recovery strategy at the retry observation threshold", () => {
    const resultDiagnosis = diagnosis("retry")
    expect(decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [candidate],
      selectedCandidateIndex: 0,
      constraintReviews: [allowedReview()],
      retryCount: 2,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [],
      nextAttemptSignature: "fallback-tool:input-v1",
    })).toMatchObject({
      state: "retry_ready",
      outcome: "retry",
      nextAttemptSignature: "fallback-tool:input-v1",
    })
  })

  it("does not claim exhausted alternatives while an allowed or unreviewed candidate remains", () => {
    const resultDiagnosis = diagnosis("stop_blocked")
    const base = {
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [candidate],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [] as string[],
      stop: {
        condition: "alternatives_exhausted" as const,
        reason: "No justified candidate remains.",
        evidenceRefs: ["review-ledger-1"],
        unresolvedScope: ["step-1"],
        userActions: ["Provide a different resource."],
      },
    }
    expect(() => decideStructuredFailureRecovery({ ...base, constraintReviews: [] })).toThrow(/every recovery candidate/i)
    expect(() => decideStructuredFailureRecovery({ ...base, constraintReviews: [allowedReview()] })).toThrow(/allowed recovery candidate remains/i)
  })

  it.each([
    "goal_achieved",
    "permission_denied",
    "safety_risk",
    "required_resource_unavailable",
    "alternatives_exhausted",
  ] satisfies RecoveryStopCondition[])("represents the %s stop condition with evidence", (condition) => {
    const action = condition === "goal_achieved" ? "final_report" : "stop_blocked"
    const resultDiagnosis = diagnosis(action)
    const result = decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [],
      constraintReviews: [],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [],
      stop: {
        condition,
        reason: `Recovery stopped because ${condition}.`,
        evidenceRefs: [`evidence:${condition}`],
        partialResultRefs: condition === "goal_achieved" ? ["result-1"] : [],
        unresolvedScope: condition === "goal_achieved" ? [] : ["step-1"],
        userActions: condition === "goal_achieved" ? [] : ["Resolve the reported condition and retry."],
      },
    })
    expect(result).toMatchObject({
      state: "stopped",
      outcome: condition === "goal_achieved" ? "completed" : "blocked",
      stopCondition: condition,
    })
  })

  it.each([
    "goal_achieved",
    "permission_denied",
    "safety_risk",
    "required_resource_unavailable",
    "alternatives_exhausted",
  ] satisfies RecoveryStopCondition[])("rejects the %s stop condition without evidence", (condition) => {
    const action = condition === "goal_achieved" ? "final_report" : "stop_blocked"
    const resultDiagnosis = diagnosis(action)
    expect(() => decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [],
      constraintReviews: [],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [],
      stop: {
        condition,
        reason: `Recovery stopped because ${condition}.`,
        evidenceRefs: [],
        unresolvedScope: condition === "goal_achieved" ? [] : ["step-1"],
        userActions: condition === "goal_achieved" ? [] : ["Resolve the condition and retry."],
      },
    })).toThrow(/stop evidence/i)
  })

  it("builds a partial report without losing completed or unresolved scope", () => {
    const resultDiagnosis = diagnosis("partial_report")
    expect(decideStructuredFailureRecovery({
      subjectPayload,
      diagnosis: resultDiagnosis,
      receipt: receipt(resultDiagnosis),
      failureDiagnosis: failure,
      recoveryCandidates: [],
      constraintReviews: [],
      retryCount: 0,
      retryLimit: 2,
      currentAttemptSignature: "primary-tool:input-v1",
      priorAttemptSignatures: [],
      partialReport: {
        partialResultRefs: ["artifact-1"],
        unresolvedScope: ["step-1"],
        nextActions: ["Install the fallback tool and resume."],
        evidenceRefs: ["test-1"],
      },
    })).toMatchObject({
      state: "report_ready",
      outcome: "partial",
      partialResultRefs: ["artifact-1"],
      unresolvedScope: ["step-1"],
    })
  })

  it("allows only the explicit recovery state sequence", () => {
    expect(transitionFailureRecovery("diagnosing", "diagnosis_recorded")).toBe("generating_candidates")
    expect(transitionFailureRecovery("generating_candidates", "candidates_generated")).toBe("reviewing_constraints")
    expect(transitionFailureRecovery("reviewing_constraints", "constraints_reviewed")).toBe("selecting_action")
    expect(transitionFailureRecovery("selecting_action", "retry_selected")).toBe("retry_ready")
    expect(() => transitionFailureRecovery("diagnosing", "retry_selected")).toThrow(/invalid failure recovery transition/i)
    expect(() => transitionFailureRecovery("stopped", "diagnosis_recorded")).toThrow(/terminal/i)
  })

  it("keeps the decision owner independent from adapters and external state", () => {
    const source = readFileSync(
      new URL("../packages/core/src/contracts/failure-recovery-decision.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/from ["'](?:openai|@anthropic-ai\/sdk|better-sqlite3|node:fs|node:http|node:https|node:net)["']/)
    expect(source).not.toMatch(/process\.env|readFile|fetch\(|globalThis/)
  })
})
