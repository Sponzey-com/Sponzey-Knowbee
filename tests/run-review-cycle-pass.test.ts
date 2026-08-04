import { describe, expect, it, vi } from "vitest"
import { runReviewCyclePass } from "../packages/core/src/runs/review-cycle-pass.ts"
import { buildStructuredFollowupKey } from "../packages/core/src/runs/completion-application.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

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
    onReviewError: vi.fn(),
  }
}

function createModuleDependencies() {
  return {
    decideReviewGate: vi.fn(() => ({
      kind: "run" as const,
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "satisfied" as const,
        executionStatus: "missing" as const,
        deliveryStatus: "not_required" as const,
        recoveryStatus: "required" as const,
        blockingReasons: ["명확한 실행 근거가 확인되지 않았습니다."],
        conflictReason: "명확한 실행 근거가 확인되지 않았습니다.",
      },
    })),
    runReviewPass: vi.fn(async () => ({
      review: {
        status: "followup",
        summary: "need followup",
        followupPrompt: "Need   more detail",
      },
      syntheticApproval: null,
    })),
    runReviewOutcomePass: vi.fn(async () => ({ kind: "break" as const })),
    getRootRun: vi.fn(() => ({
      delegationTurnCount: 2,
      maxDelegationTurns: 5,
    })),
  }
}

function createParams() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    source: "telegram" as const,
    onChunk: undefined,
    signal: new AbortController().signal,
    preview: "preview text",
    priorAssistantMessages: ["old preview"],
    executionSemantics: {
      filesystemEffect: "none",
      artifactDelivery: "none",
      approvalRequired: false,
      approvalTool: "none",
      privilegedOperation: "none",
    },
    requiresFilesystemMutation: false,
    originalRequest: "original request",
    config: DEFAULT_CONFIG,
    model: "gpt-test",
    workDir: "/tmp",
    usesWorkerRuntime: true,
    workerRuntimeKind: "worker_runtime",
    requiresPrivilegedToolExecution: false,
    successfulTools: [],
    successfulFileDeliveries: [],
    sawRealFilesystemMutation: false,
    deliveryOutcome: {
      directArtifactDeliveryRequested: false,
      hasSuccessfulArtifactDelivery: false,
      deliverySatisfied: false,
      requiresDirectArtifactRecovery: false,
    },
    truncatedOutputRecoveryAttempted: false,
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    seenFollowupPrompts: new Set([
      buildStructuredFollowupKey({
        kind: "followup",
        summary: "need followup",
        reason: "",
        remainingItems: [],
        followupPrompt: "Need   more detail",
      }),
    ]),
    syntheticApprovalAlreadyApproved: false,
    syntheticApprovalRuntimeDependencies: {
      timeoutSec: 30,
      fallback: "deny",
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

describe("run review cycle pass", () => {
  it("passes review state and delegation counts into review outcome", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = createModuleDependencies()
    const params = createParams()
    params.requiresSuccessfulToolEvidence = true

    const result = await runReviewCyclePass(params, dependencies, moduleDependencies)

    expect(result).toEqual({ kind: "break" })
    expect(params.priorAssistantMessages).toEqual(["old preview", "preview text"])
    expect(moduleDependencies.runReviewPass).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresSuccessfulToolEvidence: true,
      }),
      expect.any(Object),
    )
    expect(moduleDependencies.runReviewOutcomePass).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        preview: "preview text",
        delegationTurnCount: 2,
        maxDelegationTurns: 5,
        followupPromptSeen: true,
        syntheticApprovalSourceLabel: "worker_runtime",
      }),
      expect.any(Object),
    )
  })

  it("forwards retry outcome from review outcome pass", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = createModuleDependencies()
    moduleDependencies.runReviewOutcomePass.mockResolvedValue({
      kind: "retry",
      nextMessage: "retry prompt",
      clearWorkerRuntime: true,
      structuredFollowupKey: "completion-followup:test-key",
    })

    const result = await runReviewCyclePass(createParams(), dependencies, moduleDependencies)

    expect(result).toEqual({
      kind: "retry",
      nextMessage: "retry prompt",
      clearWorkerRuntime: true,
      structuredFollowupKey: "completion-followup:test-key",
    })
  })

  it("records only a reason code when the LLM completion review contract is rejected", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = createModuleDependencies()
    moduleDependencies.runReviewPass.mockImplementation(async (_params, reviewDependencies) => {
      reviewDependencies.onReviewRejected?.("completion_review_criteria_missing", 1)
      return { review: null, syntheticApproval: null }
    })

    await runReviewCyclePass(createParams(), dependencies, moduleDependencies)

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-1",
      "completion_review_rejected:completion_review_criteria_missing:attempt_1",
    )
    expect(JSON.stringify(dependencies.appendRunEvent.mock.calls)).not.toContain("preview text")
  })

  it("skips review pass when direct delivery already satisfies completion", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = createModuleDependencies()
    moduleDependencies.decideReviewGate.mockReturnValue({
      kind: "skip",
      state: {
        executionSatisfied: true,
        deliveryRequired: true,
        deliverySatisfied: true,
        completionSatisfied: true,
        interpretationStatus: "satisfied",
        executionStatus: "satisfied",
        deliveryStatus: "satisfied",
        recoveryStatus: "settled",
        blockingReasons: [],
      },
      reason: "직접 결과 전달과 receipt 기준 완료 근거가 이미 충족되어 completion review를 생략합니다.",
    })
    const params = createParams()
    params.deliveryOutcome = {
      directArtifactDeliveryRequested: true,
      hasSuccessfulArtifactDelivery: true,
      deliverySatisfied: true,
      requiresDirectArtifactRecovery: false,
    }
    params.successfulTools = [{ toolName: "screencapture", output: "saved capture" }]

    await runReviewCyclePass(params, dependencies, moduleDependencies)

    expect(moduleDependencies.runReviewPass).not.toHaveBeenCalled()
    expect(moduleDependencies.runReviewOutcomePass).toHaveBeenCalledWith(
      expect.objectContaining({
        review: null,
      }),
      expect.any(Object),
    )
  })

  it("routes a verified pending camera artifact directly to the delivery tool before LLM review", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = createModuleDependencies()
    const params = createParams()
    params.executionSemantics = {
      ...params.executionSemantics,
      artifactDelivery: "direct",
    }
    params.deliveryOutcome = {
      directArtifactDeliveryRequested: true,
      hasSuccessfulArtifactDelivery: false,
      deliverySatisfied: false,
      requiresDirectArtifactRecovery: true,
    }
    params.successfulTools = [{
      toolName: "yeonjang_camera_capture",
      output: "camera artifact ready",
      details: {
        kind: "camera_artifact",
        artifactRef: "artifact:32742982-7e55-4c4c-bfa5-fcfa10092231",
        mimeType: "image/jpeg",
        sizeBytes: 128,
      },
    }]

    await runReviewCyclePass(params, dependencies, moduleDependencies)

    expect(moduleDependencies.runReviewPass).not.toHaveBeenCalled()
    expect(moduleDependencies.runReviewOutcomePass).toHaveBeenCalledWith(
      expect.objectContaining({
        review: expect.objectContaining({
          status: "followup",
          followupRequiredToolNames: ["telegram_send_file"],
          followupEvidenceRefs: ["artifact:32742982-7e55-4c4c-bfa5-fcfa10092231"],
        }),
      }),
      expect.any(Object),
    )
  })

  it("skips review pass when reply text delivery already satisfies completion", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = createModuleDependencies()
    moduleDependencies.decideReviewGate.mockReturnValue({
      kind: "skip",
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
      },
      reason: "reply 텍스트 전달 receipt와 checklist 기준 완료 항목이 이미 충족되어 completion review를 생략합니다.",
    })
    const params = createParams()
    params.deliveryOutcome = {
      mode: "reply",
      directArtifactDeliveryRequested: false,
      hasSuccessfulArtifactDelivery: false,
      hasSuccessfulTextDelivery: true,
      textDeliverySatisfied: true,
      deliverySatisfied: true,
      requiresDirectArtifactRecovery: false,
    }
    params.successfulTools = [{ toolName: "web_search", output: "ok" }]

    await runReviewCyclePass(params, dependencies, moduleDependencies)

    expect(moduleDependencies.runReviewPass).not.toHaveBeenCalled()
    expect(moduleDependencies.runReviewOutcomePass).toHaveBeenCalledWith(
      expect.objectContaining({
        review: null,
        deliveryOutcome: expect.objectContaining({ hasSuccessfulTextDelivery: true }),
      }),
      expect.any(Object),
    )
  })
})
