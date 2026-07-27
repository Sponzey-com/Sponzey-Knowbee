import { describe, expect, it, vi } from "vitest"
import {
  COMPLETION_REVIEW_CRITERION_KEYS,
  buildCompletionReviewContextReceipt,
  buildCompletionReviewExpectedConditions,
} from "../packages/core/src/agent/completion-review.ts"
import { runReviewOutcomePass } from "../packages/core/src/runs/review-outcome-pass.ts"

function createDependencies() {
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

function createParams() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    source: "telegram" as const,
    onChunk: undefined,
    signal: new AbortController().signal,
    preview: "preview",
    review: null,
    syntheticApproval: null,
    executionSemantics: {
      completionMode: "normal",
      deliveryMode: "default",
      artifactMode: "none",
      requiresApproval: false,
      preferredTarget: "auto",
    },
    deliveryOutcome: {
      directArtifactDeliveryRequested: false,
      hasSuccessfulArtifactDelivery: false,
      deliverySatisfied: false,
      requiresDirectArtifactRecovery: false,
    },
    successfulTools: [],
    completionConditions: [],
    sawRealFilesystemMutation: false,
    requiresFilesystemMutation: false,
    truncatedOutputRecoveryAttempted: false,
    originalRequest: "hello",
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    defaultMaxDelegationTurns: 3,
    followupPromptSeen: false,
    syntheticApprovalAlreadyApproved: false,
    syntheticApprovalSourceLabel: "agent_reply",
    syntheticApprovalRuntimeDependencies: {
      timeoutSec: 60,
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
  }
}

describe("review outcome pass", () => {
  it("records canonical verification before invoking finalization", async () => {
    const order: string[] = []
    const recordCanonicalCompletionOutcome = vi.fn(async () => {
      order.push("verification")
      return { ok: true as const }
    })
    const applyCompletionApplicationPass = vi.fn(async () => {
      order.push("finalization")
      return { kind: "break" as const }
    })
    await runReviewOutcomePass({
      ...createParams(),
      review: { status: "complete", summary: "verified", reason: "done", remainingItems: [] },
      recordCanonicalCompletionOutcome,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
    }, createDependencies(), {
      runSyntheticApprovalPass: vi.fn(),
      applySyntheticApprovalContinuation: vi.fn(),
      runCompletionPass: vi.fn().mockReturnValue({
        application: { kind: "complete", summary: "done", persistedText: "preview", statusText: "done" },
        state: {
          executionSatisfied: true,
          deliveryRequired: false,
          deliverySatisfied: true,
          completionSatisfied: true,
          interpretationStatus: "satisfied",
          executionStatus: "satisfied",
          deliveryStatus: "not_required",
          recoveryStatus: "settled",
          blockingReasons: [],
          checklist: {
            items: [
              { key: "request", status: "completed" },
              { key: "execution", status: "completed" },
              { key: "delivery", status: "not_required" },
              { key: "completion", status: "completed" },
            ],
            completedCount: 3,
            actionableCount: 3,
            pendingCount: 0,
          },
        },
        usedTurns: 0,
        maxTurns: 3,
      }),
      applyCompletionApplicationPass,
    })

    expect(order).toEqual(["verification", "finalization"])
    expect(applyCompletionApplicationPass).toHaveBeenCalledWith(
      expect.objectContaining({ recordCanonicalDelivery: expect.any(Function) }),
      expect.anything(),
    )
  })

  it("binds an evidence-backed paths-exhausted review to exhausted delivery facts", async () => {
    const successfulTools = []
    const evidenceRef = `attempt-preview:run-1:${"b".repeat(24)}`
    const operationalEvidence = {
      artifacts: [],
      stateChanges: [{
        stateRef: evidenceRef,
        targetRef: "run:run-1:attempt",
        status: "observed" as const,
      }],
      deliveries: [],
    }
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest: "명시한 기능만 실행해줘",
      latestAssistantMessage: "요청한 기능을 실행할 수 없습니다.",
      successfulTools,
      operationalEvidence,
      completionConditions: ["명시한 기능을 실행한다."],
    })
    const expectedConditions = buildCompletionReviewExpectedConditions([
      "명시한 기능을 실행한다.",
    ])
    const recordCanonicalCompletionOutcome = vi.fn(async () => ({ ok: true as const }))
    const applyCompletionApplicationPass = vi.fn(async () => ({ kind: "break" as const }))

    await runReviewOutcomePass({
      ...createParams(),
      originalRequest: "명시한 기능만 실행해줘",
      preview: "요청한 기능을 실행할 수 없습니다.",
      successfulTools,
      operationalEvidence,
      completionConditions: ["명시한 기능을 실행한다."],
      review: {
        status: "paths_exhausted",
        summary: "허용된 다른 실행 경로가 없습니다.",
        reason: "명시한 기능을 사용할 수 없습니다.",
        remainingItems: ["명시한 기능 실행"],
        followupEvidenceRefs: [],
        criterionAssessments: COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
          criterionKey,
          applicable: true,
          verdict: "unsatisfied",
          evidenceRefs: [evidenceRef],
          uncertainty: "",
          reason: "명시한 기능을 실행하지 못했습니다.",
        })),
        conditionAssessments: expectedConditions.map((condition) => ({
          conditionId: condition.conditionId,
          verdict: "unsatisfied",
          evidenceRefs: [evidenceRef],
          uncertainty: "",
          reason: "완료 조건을 충족하지 못했습니다.",
        })),
        contextReceipt,
        terminalEvidence: {
          blockerEvidenceRefs: [],
          evaluatedAlternativeEvidenceRefs: [evidenceRef],
          excludedCandidateEvidenceRefs: [evidenceRef],
        },
      },
      responseContext: {
        originalRequest: "명시한 기능만 실행해줘",
        model: "test-model",
        config: {} as never,
        workDir: "/workspace",
        identityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "Knowbee",
          promptContext: "identity",
        },
      },
      recordCanonicalCompletionOutcome,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
    }, createDependencies(), {
      runSyntheticApprovalPass: vi.fn(),
      applySyntheticApprovalContinuation: vi.fn(),
      runCompletionPass: vi.fn().mockReturnValue({
        application: {
          kind: "stop",
          summary: "허용된 다른 실행 경로가 없습니다.",
          reason: "명시한 기능을 사용할 수 없습니다.",
          remainingItems: ["명시한 기능 실행"],
        },
        state: {
          ...completeState,
          completionSatisfied: false,
          checklist: { ...completeState.checklist, pendingCount: 1 },
        },
        usedTurns: 1,
        maxTurns: 3,
      }),
      applyCompletionApplicationPass,
    })

    expect(recordCanonicalCompletionOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ event: "PATHS_EXHAUSTED" }),
    )
    expect(applyCompletionApplicationPass).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalFinalOutcome: "exhausted",
        terminalReport: expect.objectContaining({
          outcome: "blocked",
          primaryLanguage: "ko",
          reasonCode: "solution_paths_exhausted",
        }),
      }),
      expect.anything(),
    )
  })

  it("binds a verified blocker to blocked delivery facts without claiming exhaustion", async () => {
    const evidenceRef = `permission-evidence:run-1:${"c".repeat(24)}`
    const operationalEvidence = {
      artifacts: [],
      stateChanges: [{
        stateRef: evidenceRef,
        targetRef: "camera:permission",
        status: "observed" as const,
      }],
      deliveries: [],
    }
    const contextReceipt = buildCompletionReviewContextReceipt({
      originalRequest: "카메라로 촬영해줘",
      latestAssistantMessage: "카메라 권한이 거부되어 촬영하지 못했습니다.",
      successfulTools: [],
      operationalEvidence,
    })
    const recordCanonicalCompletionOutcome = vi.fn(async () => ({ ok: true as const }))
    const applyCompletionApplicationPass = vi.fn(async () => ({ kind: "break" as const }))

    await runReviewOutcomePass({
      ...createParams(),
      originalRequest: "카메라로 촬영해줘",
      preview: "카메라 권한이 거부되어 촬영하지 못했습니다.",
      operationalEvidence,
      review: {
        status: "blocked",
        summary: "검증된 권한 차단 조건이 있습니다.",
        reason: "카메라 권한 evidence가 촬영을 차단합니다.",
        remainingItems: ["카메라 권한 허용"],
        followupEvidenceRefs: [],
        criterionAssessments: COMPLETION_REVIEW_CRITERION_KEYS.map((criterionKey) => ({
          criterionKey,
          applicable: true,
          verdict: "unsatisfied",
          evidenceRefs: [evidenceRef],
          uncertainty: "",
          reason: "권한 차단으로 촬영 결과가 없습니다.",
        })),
        contextReceipt,
        terminalEvidence: {
          blockerEvidenceRefs: [evidenceRef],
          evaluatedAlternativeEvidenceRefs: [evidenceRef],
          excludedCandidateEvidenceRefs: [],
        },
      },
      responseContext: {
        originalRequest: "카메라로 촬영해줘",
        model: "test-model",
        config: {} as never,
        workDir: "/workspace",
        identityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "Knowbee",
          promptContext: "identity",
        },
      },
      recordCanonicalCompletionOutcome,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
    }, createDependencies(), {
      runSyntheticApprovalPass: vi.fn(),
      applySyntheticApprovalContinuation: vi.fn(),
      runCompletionPass: vi.fn().mockReturnValue({
        application: {
          kind: "stop",
          summary: "카메라 권한이 필요합니다.",
          reason: "권한이 거부되었습니다.",
          remainingItems: ["카메라 권한 허용"],
        },
        state: {
          ...completeState,
          completionSatisfied: false,
          checklist: { ...completeState.checklist, pendingCount: 1 },
        },
        usedTurns: 1,
        maxTurns: 3,
      }),
      applyCompletionApplicationPass,
    })

    expect(recordCanonicalCompletionOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ event: "RESULT_BLOCKED" }),
    )
    expect(applyCompletionApplicationPass).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalFinalOutcome: "blocked",
        terminalReport: expect.objectContaining({
          outcome: "blocked",
          reasonCode: "verified_result_blocker",
        }),
      }),
      expect.anything(),
    )
  })

  it("returns synthetic approval retry continuation", async () => {
    const result = await runReviewOutcomePass({
      ...createParams(),
      syntheticApproval: {
        toolName: "screen_capture",
        summary: "화면 캡처 승인 필요",
        continuationPrompt: "continue with approval",
      },
    }, createDependencies(), {
      runSyntheticApprovalPass: vi.fn().mockResolvedValue({
        kind: "continue",
        eventLabel: "screen_capture 단계 승인",
        reviewSummary: "화면 캡처 승인 필요",
        executingSummary: "승인된 작업을 계속 진행합니다.",
        continuationPrompt: "continue with approval",
        grantMode: "single",
        clearWorkerRuntime: true,
        clearProvider: true,
      }),
      applySyntheticApprovalContinuation: vi.fn().mockReturnValue({
        kind: "continue",
        nextMessage: "continue with approval",
        clearWorkerRuntime: true,
        clearProvider: true,
      }),
      runCompletionPass: vi.fn(),
      applyCompletionApplicationPass: vi.fn(),
    })

    expect(result).toEqual({
      kind: "retry",
      nextMessage: "continue with approval",
      clearWorkerRuntime: true,
      clearProvider: true,
    })
  })

  it("returns completion retry continuation", async () => {
    const result = await runReviewOutcomePass({
      ...createParams(),
      review: {
        status: "followup",
        summary: "retry needed",
        reason: "missing output",
        followupPrompt: "Need more details",
      },
    }, createDependencies(), {
      runSyntheticApprovalPass: vi.fn(),
      applySyntheticApprovalContinuation: vi.fn(),
      runCompletionPass: vi.fn().mockReturnValue({
        decision: { kind: "followup", prompt: "Need more details" },
        application: { kind: "retry" },
        usedTurns: 0,
        maxTurns: 3,
      }),
      applyCompletionApplicationPass: vi.fn().mockResolvedValue({
        kind: "retry",
        nextMessage: "Need more details",
        clearWorkerRuntime: true,
        structuredFollowupKey: "completion-followup:test-key",
      }),
    })

    expect(result).toEqual({
      kind: "retry",
      nextMessage: "Need more details",
      clearWorkerRuntime: true,
      structuredFollowupKey: "completion-followup:test-key",
    })
  })

  it("breaks when completion application does not retry", async () => {
    const applyCompletionApplicationPass = vi.fn().mockResolvedValue({
      kind: "break",
    })

    const result = await runReviewOutcomePass({
      ...createParams(),
      previewSource: "runtime_deterministic",
      deferredPreviewDelivery: true,
    }, createDependencies(), {
      runSyntheticApprovalPass: vi.fn(),
      applySyntheticApprovalContinuation: vi.fn(),
      runCompletionPass: vi.fn().mockReturnValue({
        decision: { kind: "complete" },
        application: { kind: "complete" },
        usedTurns: 0,
        maxTurns: 3,
      }),
      applyCompletionApplicationPass,
    })

    expect(result).toEqual({ kind: "break" })
    expect(applyCompletionApplicationPass).toHaveBeenCalledWith(expect.objectContaining({
      previewSource: "runtime_deterministic",
      deferredPreviewDelivery: true,
    }), expect.anything())
  })
})
