import { describe, expect, it, vi } from "vitest"
import { applyCompletionApplicationPass } from "../packages/core/src/runs/completion-application-pass.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
  }
}

function createRetryDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
  }
}

describe("completion application pass", () => {
  const responseContext = {
    originalRequest: "원본 요청",
    model: "gpt-test",
    providerId: "openai",
    workDir: "/tmp/project",
  }

  it("marks completion and breaks on complete application", async () => {
    const markRunCompleted = vi.fn()

    const result = await applyCompletionApplicationPass({
      runId: "run-1",
      sessionId: "session-1",
      source: "telegram",
      onChunk: undefined,
      preview: "결과",
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
      application: {
        kind: "complete",
        summary: "완료",
        persistedText: "완료했습니다.",
        statusText: "완료했습니다.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn().mockReturnValue({ kind: "complete" }),
      markRunCompleted,
      applyTerminalApplication: vi.fn(),
      applyRecoveryRetryState: vi.fn(),
    })

    expect(result).toEqual({ kind: "break" })
    expect(markRunCompleted).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-1",
      sessionId: "session-1",
      text: "완료했습니다.",
    }))
  })

  it("finalizes runtime deterministic complete text through final response rendering", async () => {
    const markRunCompleted = vi.fn()
    const completeRunWithAssistantMessage = vi.fn().mockResolvedValue({ status: "completed" })

    const result = await applyCompletionApplicationPass({
      runId: "run-runtime-complete",
      sessionId: "session-runtime-complete",
      source: "telegram",
      onChunk: vi.fn(),
      preview: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
      previewSource: "runtime_deterministic",
      deferredPreviewDelivery: true,
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
      application: {
        kind: "complete",
        summary: "완료",
        persistedText: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
        statusText: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn().mockReturnValue({ kind: "complete" }),
      completeRunWithAssistantMessage,
      markRunCompleted,
      applyTerminalApplication: vi.fn(),
      applyRecoveryRetryState: vi.fn(),
    })

    expect(result).toEqual({ kind: "break" })
    expect(markRunCompleted).not.toHaveBeenCalled()
    expect(completeRunWithAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-runtime-complete",
      sessionId: "session-runtime-complete",
      text: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
      textSource: "runtime_deterministic",
      responseContext,
    }))
  })

  it("finalizes LLM-generated deferred complete text through final response rendering", async () => {
    const markRunCompleted = vi.fn()
    const completeRunWithAssistantMessage = vi.fn().mockResolvedValue({ status: "completed" })

    const result = await applyCompletionApplicationPass({
      runId: "run-llm-complete",
      sessionId: "session-llm-complete",
      source: "telegram",
      onChunk: vi.fn(),
      preview: "모델이 만든 완료 응답입니다.",
      previewSource: "llm_generated",
      deferredPreviewDelivery: true,
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
      application: {
        kind: "complete",
        summary: "완료",
        persistedText: "모델이 만든 완료 응답입니다.",
        statusText: "모델이 만든 완료 응답입니다.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn().mockReturnValue({ kind: "complete" }),
      completeRunWithAssistantMessage,
      markRunCompleted,
      applyTerminalApplication: vi.fn(),
      applyRecoveryRetryState: vi.fn(),
    })

    expect(result).toEqual({ kind: "break" })
    expect(markRunCompleted).not.toHaveBeenCalled()
    expect(completeRunWithAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-llm-complete",
      sessionId: "session-llm-complete",
      text: "모델이 만든 완료 응답입니다.",
      textSource: "llm_generated",
      responseContext,
    }))
  })

  it("requires canonical delivery finalization for canonical root completion", async () => {
    const completeRunWithAssistantMessage = vi.fn().mockResolvedValue({ status: "completed" })
    const recordCanonicalDelivery = vi.fn(async () => ({ ok: true as const }))
    const stageCanonicalPendingResponse = vi.fn(async () => ({ ok: true as const }))
    const consumeCanonicalPendingResponse = vi.fn(async () => ({ ok: true as const }))
    await applyCompletionApplicationPass({
      runId: "run-canonical-complete",
      sessionId: "session-canonical-complete",
      source: "telegram",
      onChunk: vi.fn(),
      preview: "verified result",
      previewSource: "llm_generated",
      deferredPreviewDelivery: true,
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
      application: { kind: "complete", summary: "done", persistedText: "verified result", statusText: "done" },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: { interpretation: 0, execution: 0, delivery: 0, external: 0 },
      finalizationDependencies: createFinalizationDependencies(),
      recordCanonicalDelivery,
      stageCanonicalPendingResponse,
      consumeCanonicalPendingResponse,
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn().mockReturnValue({ kind: "complete" }),
      completeRunWithAssistantMessage,
      markRunCompleted: vi.fn(),
      applyTerminalApplication: vi.fn(),
      applyRecoveryRetryState: vi.fn(),
    })

    expect(completeRunWithAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      recordCanonicalDelivery,
      stageCanonicalPendingResponse,
      consumeCanonicalPendingResponse,
      canonicalFinalOutcome: "succeeded",
    }))
  })

  it("applies retry state and returns next message on retry application", async () => {
    const applyRecoveryRetryState = vi.fn().mockReturnValue({
      nextMessage: "retry prompt",
      clearWorkerRuntime: true,
      clearProvider: false,
    })

    const result = await applyCompletionApplicationPass({
      runId: "run-2",
      sessionId: "session-2",
      source: "webui",
      onChunk: undefined,
      preview: "partial",
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "followup_required",
        executionStatus: "missing",
        deliveryStatus: "not_required",
        recoveryStatus: "required",
        blockingReasons: ["completion review가 추가 follow-up 작업을 요구합니다."],
        conflictReason: "completion review가 추가 follow-up 작업을 요구합니다.",
      },
      application: {
        kind: "retry",
        budgetKind: "execution",
        summary: "중간에 끊긴 작업을 다시 시도합니다.",
        eventLabel: "중간 절단 복구",
        nextMessage: "retry prompt",
        reviewStepStatus: "completed",
        executingStepSummary: "다시 시도합니다.",
        structuredFollowupKey: "completion-followup:test-key",
        markTruncatedOutputRecoveryAttempted: true,
        clearWorkerRuntime: true,
      },
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn(),
      markRunCompleted: vi.fn(),
      applyTerminalApplication: vi.fn(),
      applyRecoveryRetryState,
    })

    expect(applyRecoveryRetryState).toHaveBeenCalled()
    expect(result).toEqual({
      kind: "retry",
      nextMessage: "retry prompt",
      clearWorkerRuntime: true,
      structuredFollowupKey: "completion-followup:test-key",
      markTruncatedOutputRecoveryAttempted: true,
    })
  })

  it("marks awaiting_user explicit messages as mixed when runtime text is appended", async () => {
    const applyTerminalApplication = vi.fn().mockResolvedValue("awaiting_user")

    const result = await applyCompletionApplicationPass({
      runId: "run-3",
      sessionId: "session-3",
      source: "cli",
      onChunk: undefined,
      preview: "partial",
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "user_input_required",
        executionStatus: "missing",
        deliveryStatus: "not_required",
        recoveryStatus: "required",
        blockingReasons: ["completion review가 사용자 추가 입력을 요구합니다."],
        conflictReason: "completion review가 사용자 추가 입력을 요구합니다.",
      },
      application: {
        kind: "awaiting_user",
        summary: "추가 입력이 필요합니다.",
        userMessage: "파일명을 알려 주세요.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn(),
      markRunCompleted: vi.fn(),
      applyTerminalApplication,
      applyRecoveryRetryState: vi.fn(),
    })

    expect(result).toEqual({ kind: "break" })
    expect(applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-3",
      sessionId: "session-3",
      source: "cli",
      application: expect.objectContaining({
        kind: "awaiting_user",
        summary: "추가 입력이 필요합니다.",
        userMessageSource: "mixed",
      }),
      responseContext,
    }))
  })

  it("keeps pure awaiting_user explicit messages as llm_generated", async () => {
    const applyTerminalApplication = vi.fn().mockResolvedValue("awaiting_user")

    await applyCompletionApplicationPass({
      runId: "run-awaiting-pure-llm",
      sessionId: "session-awaiting-pure-llm",
      source: "telegram",
      onChunk: undefined,
      preview: "",
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "user_input_required",
        executionStatus: "missing",
        deliveryStatus: "not_required",
        recoveryStatus: "required",
        blockingReasons: ["completion review가 사용자 추가 입력을 요구합니다."],
        conflictReason: "completion review가 사용자 추가 입력을 요구합니다.",
      },
      application: {
        kind: "awaiting_user",
        summary: "추가 입력이 필요합니다.",
        userMessage: "파일명을 알려 주세요.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn(),
      markRunCompleted: vi.fn(),
      applyTerminalApplication,
      applyRecoveryRetryState: vi.fn(),
    })

    expect(applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "awaiting_user",
        userMessageSource: "llm_generated",
      }),
      responseContext,
    }))
  })

  it("marks awaiting_user applications without explicit user messages as runtime deterministic", async () => {
    const applyTerminalApplication = vi.fn().mockResolvedValue("awaiting_user")

    await applyCompletionApplicationPass({
      runId: "run-awaiting-fallback",
      sessionId: "session-awaiting-fallback",
      source: "telegram",
      onChunk: undefined,
      preview: "partial",
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "user_input_required",
        executionStatus: "missing",
        deliveryStatus: "not_required",
        recoveryStatus: "required",
        blockingReasons: ["completion review가 사용자 추가 입력을 요구합니다."],
        conflictReason: "completion review가 사용자 추가 입력을 요구합니다.",
      },
      application: {
        kind: "awaiting_user",
        summary: "추가 입력이 필요합니다.",
        reason: "대상이 모호합니다.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn(),
      markRunCompleted: vi.fn(),
      applyTerminalApplication,
      applyRecoveryRetryState: vi.fn(),
    })

    expect(applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "awaiting_user",
        userMessageSource: "runtime_deterministic",
      }),
      responseContext,
    }))
  })

  it("blocks complete application when completion state is not satisfied", async () => {
    const markRunCompleted = vi.fn()
    const applyTerminalApplication = vi.fn().mockResolvedValue("cancelled")

    const result = await applyCompletionApplicationPass({
      runId: "run-4",
      sessionId: "session-4",
      source: "telegram",
      onChunk: undefined,
      preview: "스크린샷을 만들었습니다.",
      state: {
        executionSatisfied: true,
        deliveryRequired: true,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "satisfied",
        executionStatus: "satisfied",
        deliveryStatus: "missing",
        recoveryStatus: "required",
        blockingReasons: ["요청된 직접 결과 전달이 아직 완료되지 않았습니다."],
        conflictReason: "요청된 직접 결과 전달이 아직 완료되지 않았습니다.",
      },
      application: {
        kind: "complete",
        summary: "완료",
        persistedText: "완료했습니다.",
        statusText: "완료했습니다.",
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn().mockReturnValue({
        kind: "stop",
        summary: "완료 판정 근거가 부족해 자동 진행을 중단합니다.",
        reason: "요청된 직접 결과 전달이 아직 완료되지 않았습니다.",
        remainingItems: ["실행/전달/복구 상태를 다시 확인해야 합니다."],
      }),
      markRunCompleted,
      applyTerminalApplication,
      applyRecoveryRetryState: vi.fn(),
    })

    expect(result).toEqual({ kind: "break" })
    expect(markRunCompleted).not.toHaveBeenCalled()
    expect(applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "stop",
        reason: "요청된 직접 결과 전달이 아직 완료되지 않았습니다.",
        userMessageSource: "runtime_deterministic",
      }),
      responseContext,
    }))
  })

  it("preserves response context for explicit stop completion applications", async () => {
    const applyTerminalApplication = vi.fn().mockResolvedValue("cancelled")
    const recordCanonicalDelivery = vi.fn(async () => ({ ok: true as const }))
    const terminalReport = {
      schemaVersion: 1 as const,
      goalId: "goal:run-explicit-stop",
      workId: "work:run-explicit-stop",
      outcome: "blocked" as const,
      primaryLanguage: "ko" as const,
      completedScope: [],
      unresolvedScope: ["사용자 요청"],
      reasonCode: "solution_paths_exhausted",
      verifiedReasonFacts: ["허용된 실행 경로가 소진되었습니다."],
      evidenceRefs: [`tool-result:tool:${"c".repeat(64)}`],
      nextActions: [{ kind: "required_condition" as const, text: "사용 가능한 기능이 추가되면 다시 요청하세요." }],
    }

    const result = await applyCompletionApplicationPass({
      runId: "run-explicit-stop",
      sessionId: "session-explicit-stop",
      source: "telegram",
      onChunk: undefined,
      preview: "partial",
      state: {
        executionSatisfied: false,
        deliveryRequired: false,
        deliverySatisfied: false,
        completionSatisfied: false,
        interpretationStatus: "satisfied",
        executionStatus: "failed",
        deliveryStatus: "not_required",
        recoveryStatus: "exhausted",
        blockingReasons: ["복구 예산을 소진했습니다."],
        conflictReason: "복구 예산을 소진했습니다.",
      },
      application: {
        kind: "stop",
        summary: "자동 진행을 중단합니다.",
        reason: "복구 예산을 소진했습니다.",
        remainingItems: ["사용자 확인이 필요합니다."],
      },
      responseContext,
      maxTurns: 3,
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 3,
        delivery: 0,
        external: 0,
      },
      finalizationDependencies: createFinalizationDependencies(),
      recordCanonicalDelivery,
      canonicalFinalOutcome: "exhausted",
      terminalReport,
    }, createRetryDependencies(), {
      decideCompletionTerminalOutcome: vi.fn(),
      markRunCompleted: vi.fn(),
      applyTerminalApplication,
      applyRecoveryRetryState: vi.fn(),
    })

    expect(result).toEqual({ kind: "break" })
    expect(applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      runId: "run-explicit-stop",
      sessionId: "session-explicit-stop",
      source: "telegram",
      application: expect.objectContaining({
        kind: "stop",
        summary: "자동 진행을 중단합니다.",
        reason: "복구 예산을 소진했습니다.",
        userMessageSource: "runtime_deterministic",
        remainingItems: ["사용자 확인이 필요합니다."],
      }),
      responseContext,
      recordCanonicalDelivery,
      canonicalFinalOutcome: "exhausted",
      terminalReport,
    }))
  })
})
