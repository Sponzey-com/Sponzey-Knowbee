import { describe, expect, it } from "vitest"
import {
  CONTRACT_SCHEMA_VERSION,
  buildRuntimeChildWorkResult,
  validateChildWorkResult,
  type ActionDecision,
  type LlmResultDiagnosisRecord,
  type RuntimeChildResultReviewSnapshot,
} from "../packages/core/src/contracts/index.ts"
import type { ResultReport } from "../packages/core/src/contracts/sub-agent-orchestration.ts"

const finalReportDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result satisfies the delegated task.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The output and evidence are enough for parent aggregation.",
}

const retryDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result is incomplete and needs one retry.",
  sufficiency: "partial",
  missing_information: ["test evidence"],
  conflicts: [],
  risk: "none",
  risks: ["Incomplete verification."],
  confidence: "medium",
  recommended_action: "retry",
  reason: "The child result misses required evidence.",
}

const finalReportAction: ActionDecision = {
  selected_action: "final_report",
  reason: "The result is ready for parent aggregation.",
}

const retryAction: ActionDecision = {
  selected_action: "retry",
  reason: "The missing verification can be recovered with one changed step.",
}

function resultReport(overrides: Partial<ResultReport> = {}): ResultReport {
  return {
    identity: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      entityType: "sub_session",
      entityId: "sub-session-1",
      owner: { ownerType: "sub_agent", ownerId: "agent:dev" },
      idempotencyKey: "result-report:sub-session-1",
      parent: {
        parentRunId: "parent-run-1",
        parentSessionId: "session-1",
        parentRequestId: "request-1",
      },
    },
    resultReportId: "result-report-1",
    parentRunId: "parent-run-1",
    subSessionId: "sub-session-1",
    source: {
      entityType: "sub_agent",
      entityId: "agent:dev",
      agentNameSnapshot: "개발자",
    },
    status: "completed",
    outputs: [{
      outputId: "patch-summary",
      status: "satisfied",
      value: { summary: "Patch applied and verified." },
    }],
    evidence: [{
      evidenceId: "evidence-1",
      kind: "test_result",
      sourceRef: "vitest:task0006",
      sourceTimestamp: "2026-07-03T00:00:00.000Z",
    }],
    artifacts: [],
    risksOrGaps: [],
    ...overrides,
  }
}

function acceptedReview(overrides: Partial<RuntimeChildResultReviewSnapshot> = {}): RuntimeChildResultReviewSnapshot {
  return {
    accepted: true,
    status: "completed",
    missingItems: [],
    requiredChanges: [],
    risksOrGaps: [],
    canRetry: false,
    ...overrides,
  }
}

describe("task0006 runtime child result projection", () => {
  it("projects a completed result report into a valid child work result", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport(),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: finalReportDiagnosis,
      actionDecision: finalReportAction,
      review: acceptedReview(),
      actionsTaken: ["edited files", "ran tests"],
      toolsUsed: ["filesystem", "vitest"],
    })

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return
    expect(result.value.work_id).toBe("work:sub-session-1")
    expect(result.value.agent_name).toBe("개발자")
    expect(result.value.status).toBe("completed")
    expect(result.value.completed_steps).toContain("result-report:result-report-1")
    expect(result.value.failed_steps).toEqual([])
    expect(result.value.evidence).toContain("test_result:vitest:task0006")
    expect(result.value.needs_parent_review).toBe(true)

    const validation = validateChildWorkResult(result.value)
    expect(validation.ok, JSON.stringify(validation.issues, null, 2)).toBe(true)
  })

  it("projects a needs-revision review into a partial child work result", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport({
        status: "needs_revision",
        outputs: [{ outputId: "patch-summary", status: "partial", value: "Patch exists without test evidence." }],
        risksOrGaps: ["Tests were not run."],
      }),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: retryDiagnosis,
      actionDecision: retryAction,
      review: acceptedReview({
        accepted: false,
        status: "needs_revision",
        missingItems: ["test evidence"],
        requiredChanges: ["Run the targeted test and report evidence."],
        risksOrGaps: ["Verification is incomplete."],
        canRetry: true,
      }),
    })

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe("partial")
    expect(result.value.failed_steps).toContain("result-report:result-report-1")
    expect(result.value.missing_information).toEqual(expect.arrayContaining([
      "test evidence",
      "output:patch-summary",
    ]))
    expect(result.value.recommended_next_step).toBe("Run the targeted test and report evidence.")
  })

  it("projects failed reports into failed child work results", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport({
        status: "failed",
        outputs: [{ outputId: "patch-summary", status: "missing" }],
        impossibleReason: {
          kind: "policy",
          reasonCode: "permission_denied",
          detail: "Required write permission was not granted.",
        },
      }),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: {
        ...retryDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "stop_blocked",
      },
      actionDecision: {
        selected_action: "stop_blocked",
        reason: "Permission is missing.",
      },
      review: acceptedReview({ accepted: false, status: "failed", canRetry: false }),
    })

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return
    expect(result.value.status).toBe("failed")
    expect(result.value.risks).toContain("permission_denied:Required write permission was not granted.")
    expect(result.value.failure_diagnosis).toEqual({
      failed_step_id: "result-report:result-report-1",
      failure_reason: "permission_denied",
      failed_input_refs: ["output:patch-summary"],
      failed_strategy: "child_result_projection",
      recoverable: false,
    })
  })

  it("preserves an explicit failure diagnosis instead of replacing it with report fallback", () => {
    const explicitFailureDiagnosis = {
      failed_step_id: "step:write",
      failure_reason: "filesystem_denied",
      failed_input_refs: ["input:patch"],
      failed_strategy: "write_patch",
      recoverable: false,
    }
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport({ status: "failed" }),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: {
        ...retryDiagnosis,
        sufficiency: "insufficient",
        recommended_action: "stop_blocked",
      },
      actionDecision: {
        selected_action: "stop_blocked",
        reason: "Filesystem permission is missing.",
      },
      review: acceptedReview({ accepted: false, status: "failed", canRetry: false }),
      failedStepIds: ["step:write"],
      failureDiagnosis: explicitFailureDiagnosis,
    })

    expect(result.ok, JSON.stringify(result.issues, null, 2)).toBe(true)
    if (!result.ok) return
    expect(result.value.failure_diagnosis).toEqual(explicitFailureDiagnosis)
  })

  it("fails through child result validation when diagnosis or action decision is missing", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport(),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: undefined as never,
      actionDecision: undefined as never,
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.result_diagnosis" }),
      expect.objectContaining({ path: "$.action_decision" }),
    ]))
  })

  it("fails projection when the action decision contradicts result diagnosis", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport(),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: finalReportDiagnosis,
      actionDecision: retryAction,
      review: acceptedReview(),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.action_decision.selected_action",
      code: "contract_validation_failed",
      message: "Child work result action decision must match result_diagnosis.recommended_action.",
    })
  })

  it("fails projection when a completed report still has retry diagnosis and action", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport(),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: {
        ...finalReportDiagnosis,
        recommended_action: "retry",
        reason: "The parent should retry before aggregation.",
      },
      actionDecision: retryAction,
      review: acceptedReview(),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "completed child work result requires sufficient final_report diagnosis and action decision.",
    })
  })

  it("fails projection when a needs-revision report still has final report diagnosis", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport({
        status: "needs_revision",
        outputs: [{ outputId: "patch-summary", status: "partial", value: "Patch exists without test evidence." }],
        risksOrGaps: ["Tests were not run."],
      }),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: finalReportDiagnosis,
      actionDecision: finalReportAction,
      review: acceptedReview({
        accepted: false,
        status: "needs_revision",
        missingItems: ["test evidence"],
        requiredChanges: ["Run the targeted test and report evidence."],
        risksOrGaps: ["Verification is incomplete."],
        canRetry: true,
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "partial child work result requires partial diagnosis and a non-final next action.",
    })
  })

  it("fails projection when a failed report still has final report diagnosis", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport({
        status: "failed",
        outputs: [{ outputId: "patch-summary", status: "missing" }],
        impossibleReason: {
          kind: "policy",
          reasonCode: "permission_denied",
          detail: "Required write permission was not granted.",
        },
      }),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: finalReportDiagnosis,
      actionDecision: finalReportAction,
      review: acceptedReview({ accepted: false, status: "failed", canRetry: false }),
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.status",
      code: "contract_validation_failed",
      message: "failed child work result requires non-sufficient diagnosis and non-final action decision.",
    })
  })

  it("fails projection when recovery attempts repeat the failed strategy", () => {
    const result = buildRuntimeChildWorkResult({
      resultReport: resultReport({
        status: "failed",
        outputs: [{ outputId: "patch-summary", status: "missing" }],
      }),
      agentName: "개발자",
      taskGoal: "Implement the focused change.",
      resultDiagnosis: {
        ...retryDiagnosis,
        sufficiency: "insufficient",
      },
      actionDecision: retryAction,
      review: acceptedReview({ accepted: false, status: "failed", canRetry: true }),
      failureDiagnosis: {
        failed_step_id: "step-1",
        failure_reason: "tool_unavailable",
        failed_input_refs: ["same-input"],
        failed_strategy: "use_tool:a",
        recoverable: true,
      },
      recoveryAttempts: [{
        action_type: "use_tool",
        changed_input_or_strategy: "use_tool:a",
        expected_benefit: "Try the same unavailable tool again.",
        risk: "low",
        changed_dimensions: [],
      }],
    })

    expect(result.ok).toBe(false)
    expect(result.issues).toContainEqual({
      path: "$.recovery_attempts[0].changed_dimensions",
      code: "contract_validation_failed",
      message: "Recovery candidate must change input, strategy, tool, delegation target, permission, scope, or validation method.",
    })
  })
})
