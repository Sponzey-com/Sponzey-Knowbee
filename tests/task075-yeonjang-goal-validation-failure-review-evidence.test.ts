import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { runReviewCyclePass } from "../packages/core/src/runs/review-cycle-pass.ts"

function dependencies() {
  return {
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
  }
}

function params() {
  return {
    runId: "run-075",
    sessionId: "session-075",
    source: "webui" as const,
    onChunk: undefined,
    signal: new AbortController().signal,
    preview: "",
    priorAssistantMessages: [],
    executionSemantics: {
      filesystemEffect: "none",
      artifactDelivery: "none",
      approvalRequired: false,
      approvalTool: "none",
      privilegedOperation: "external_system",
    },
    requiresFilesystemMutation: false,
    originalRequest: "버튼을 눌러 다음 단계로 이동한다.",
    model: "test-model",
    diagnosisProvider: {
      diagnoseRequest: () => null,
      diagnoseResult: () => null,
    },
    config: DEFAULT_CONFIG,
    workDir: "/tmp",
    usesWorkerRuntime: false,
    requiresPrivilegedToolExecution: true,
    successfulTools: [],
    completionConditions: ["다음 단계가 표시되어야 한다."],
    successfulFileDeliveries: [],
    sawRealFilesystemMutation: false,
    deliveryOutcome: {
      directArtifactDeliveryRequested: false,
      hasSuccessfulArtifactDelivery: false,
      deliverySatisfied: false,
      requiresDirectArtifactRecovery: false,
    },
    yeonjangSideEffectGoalValidationCandidates: [{
      toolName: "mouse_click",
      output: "외부 변경 결과를 검증하거나 자동 복구할 수 없습니다.",
      details: {
        kind: "side_effect_manual_intervention",
        operationId: "side-effect-operation-075",
        goalValidationCandidate: true,
        rawObservedState: "must-not-leak",
      },
    }],
    truncatedOutputRecoveryAttempted: false,
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    seenFollowupPrompts: new Set<string>(),
    syntheticApprovalAlreadyApproved: false,
    syntheticApprovalRuntimeDependencies: {
      timeoutSec: 30,
      fallback: "deny" as const,
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      cancelRun: vi.fn(),
      emitApprovalResolved: vi.fn(),
      emitApprovalRequest: vi.fn(),
      onRequested: vi.fn(),
    },
    finalizationDependencies: {
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunSuccess: vi.fn(),
      rememberRunFailure: vi.fn(),
    },
    approvalRequired: false,
    approvalTool: "none",
    defaultMaxDelegationTurns: 8,
  }
}

describe("Task 075 Yeonjang goal validation failure review evidence", () => {
  it("passes validation failure reason to completion review as sanitized operational evidence", async () => {
    const deps = dependencies()
    const reviewPass = vi.fn(async () => ({ review: null, syntheticApproval: null }))
    const moduleDependencies = {
      getDb: vi.fn(() => ({} as never)),
      validateAndAppendYeonjangSideEffectGoalValidationEvidence: vi.fn(async () => ({
        added: 0,
        skipped: [{
          toolName: "mouse_click",
          reasonCode: "candidate_not_validated" as const,
          detail: "result_diagnosis_not_sufficient",
        }],
      })),
      decideReviewGate: vi.fn(() => ({
        kind: "run" as const,
        state: {
          executionSatisfied: false,
          deliveryRequired: false,
          deliverySatisfied: true,
          completionSatisfied: false,
          interpretationStatus: "satisfied" as const,
          executionStatus: "missing" as const,
          deliveryStatus: "not_required" as const,
          recoveryStatus: "required" as const,
          blockingReasons: ["명확한 실행 근거가 확인되지 않았습니다."],
        },
      })),
      runReviewPass: reviewPass,
      runReviewOutcomePass: vi.fn(async () => ({ kind: "break" as const })),
      getRootRun: vi.fn(() => ({ delegationTurnCount: 1, maxDelegationTurns: 8 })),
    }

    await runReviewCyclePass(params(), deps, moduleDependencies)

    expect(reviewPass).toHaveBeenCalledWith(
      expect.objectContaining({
        operationalEvidence: expect.objectContaining({
          stateChanges: expect.arrayContaining([
            {
              stateRef:
                "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient",
              targetRef: "tool:mouse_click:side-effect-goal",
              status: "not_observed",
            },
          ]),
        }),
      }),
      expect.any(Object),
    )
    expect(JSON.stringify(reviewPass.mock.calls)).not.toContain("must-not-leak")
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run-075",
      "yeonjang_side_effect_goal_validation_skipped:mouse_click:candidate_not_validated",
    )
  })
})
