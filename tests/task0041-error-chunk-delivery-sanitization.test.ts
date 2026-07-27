import { describe, expect, it, vi } from "vitest"
import { applyErrorChunkPass } from "../packages/core/src/runs/error-chunk-pass.ts"

function createDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
  }
}

function baseParams() {
  return {
    runId: "run-0041",
    sessionId: "session-0041",
    source: "telegram" as const,
    onChunk: undefined,
    chunk: { type: "error" as const, message: "401 invalid api key: sk-error-chunk-secret" },
    aborted: false,
    recoveryBudgetUsage: {
      interpretation: 0,
      execution: 0,
      delivery: 0,
      external: 0,
    },
    usedTurns: 0,
    maxDelegationTurns: 3,
    successfulFileDeliveries: [],
    successfulTextDeliveries: [],
  }
}

describe("task0041 error chunk delivery sanitization", () => {
  it("blocks direct error chunk delivery when execution recovery limit is stopped", async () => {
    const dependencies = createDependencies()
    const deliverTrackedChunk = vi.fn().mockResolvedValue(undefined)

    await applyErrorChunkPass({
      ...baseParams(),
      executionRecoveryLimitStop: {
        summary: "실행 복구를 자동으로 계속할 수 없습니다.",
        reason: "no safe alternative",
        remainingItems: ["manual action"],
      },
      activeWorkerRuntime: undefined,
    }, dependencies, {
      applyExternalRecoveryAttempt: vi.fn(),
      applyFatalFailure: vi.fn(),
      describeWorkerRuntimeErrorReason: vi.fn(),
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-0041", "user_facing_error_delivery_blocked:llm_required")
    expect(deliverTrackedChunk).not.toHaveBeenCalled()
    expect(JSON.stringify(deliverTrackedChunk.mock.calls)).not.toContain("sk-error-chunk-secret")
  })

  it("blocks direct error chunk delivery while preserving raw message for worker runtime recovery", async () => {
    const dependencies = createDependencies()
    const deliverTrackedChunk = vi.fn().mockResolvedValue(undefined)
    const applyExternalRecoveryAttempt = vi.fn().mockReturnValue({
      kind: "retry",
      payload: {
        summary: "코드 작업 세션 오류를 분석하고 다른 경로로 재시도합니다.",
        reason: "auth failure",
        message: "401 invalid api key: sk-error-chunk-secret",
      },
    })

    await applyErrorChunkPass({
      ...baseParams(),
      source: "webui",
      executionRecoveryLimitStop: null,
      activeWorkerRuntime: {
        kind: "internal_ai",
        targetId: "worker:internal_ai",
        label: "코드 작업 보조 세션",
        command: "disabled",
      },
      workerSessionId: "worker-0041",
      usedTurns: 1,
    }, dependencies, {
      applyExternalRecoveryAttempt,
      applyFatalFailure: vi.fn(),
      describeWorkerRuntimeErrorReason: vi.fn().mockReturnValue("auth failure"),
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-0041", "user_facing_error_delivery_blocked:llm_required")
    expect(deliverTrackedChunk).not.toHaveBeenCalled()
    expect(applyExternalRecoveryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        message: "401 invalid api key: sk-error-chunk-secret",
      }),
    }), dependencies)
  })

  it("blocks direct error chunk delivery when fatal failure is applied", async () => {
    const dependencies = createDependencies()
    const deliverTrackedChunk = vi.fn().mockResolvedValue(undefined)

    await applyErrorChunkPass({
      ...baseParams(),
      source: "cli",
      executionRecoveryLimitStop: null,
      activeWorkerRuntime: undefined,
    }, dependencies, {
      applyExternalRecoveryAttempt: vi.fn(),
      applyFatalFailure: vi.fn().mockReturnValue("failed"),
      describeWorkerRuntimeErrorReason: vi.fn(),
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith("run-0041", "user_facing_error_delivery_blocked:llm_required")
    expect(deliverTrackedChunk).not.toHaveBeenCalled()
    expect(JSON.stringify(deliverTrackedChunk.mock.calls)).not.toContain("sk-error-chunk-secret")
  })
})
