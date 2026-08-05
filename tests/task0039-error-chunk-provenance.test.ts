import { describe, expect, it, vi } from "vitest"
import { applyErrorChunkPass } from "../packages/core/src/runs/error-chunk-pass.ts"
import { applyRootRunDriverFailure } from "../packages/core/src/runs/root-run-driver-failure.ts"

function createErrorChunkDependencies() {
  return {
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
  }
}

function createBaseErrorChunkParams() {
  return {
    runId: "run-error-chunk-provenance",
    sessionId: "session-error-chunk-provenance",
    source: "telegram" as const,
    onChunk: undefined,
    chunk: { type: "error" as const, message: "command failed" },
    aborted: false,
    executionRecoveryLimitStop: null,
    activeWorkerRuntime: undefined,
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

describe("task0039 error chunk provenance", () => {
  it("records source and blocks direct delivery for fatal error chunk handling", async () => {
    const dependencies = createErrorChunkDependencies()
    const deliverTrackedChunk = vi.fn()

    const result = await applyErrorChunkPass({
      ...createBaseErrorChunkParams(),
    }, dependencies, {
      applyExternalRecoveryAttempt: vi.fn(),
      applyFatalFailure: vi.fn().mockReturnValue("failed"),
      describeWorkerRuntimeErrorReason: vi.fn(),
    })

    expect(result).toEqual({ failed: true })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-error-chunk-provenance",
      "user_facing_error_text_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-error-chunk-provenance",
      "user_facing_error_delivery_blocked:llm_required",
    )
    expect(deliverTrackedChunk).not.toHaveBeenCalled()
  })

  it("records source and blocks direct delivery for worker runtime recovery errors", async () => {
    const dependencies = createErrorChunkDependencies()
    const deliverTrackedChunk = vi.fn()

    const result = await applyErrorChunkPass({
      ...createBaseErrorChunkParams(),
      activeWorkerRuntime: {
        kind: "internal_ai",
        targetId: "worker:internal_ai",
        label: "코드 작업 보조 세션",
        command: "disabled",
      },
      workerSessionId: "worker-1",
    }, dependencies, {
      applyExternalRecoveryAttempt: vi.fn().mockReturnValue({
        kind: "retry",
        payload: {
          summary: "코드 작업 보조 세션 오류를 분석하고 다른 경로로 재시도합니다.",
          reason: "sandbox denied",
          message: "command failed",
        },
      }),
      applyFatalFailure: vi.fn(),
      describeWorkerRuntimeErrorReason: vi.fn().mockReturnValue("sandbox denied"),
    })

    expect(result).toEqual({
      failed: false,
      workerRuntimeRecovery: {
        summary: "코드 작업 보조 세션 오류를 분석하고 다른 경로로 재시도합니다.",
        reason: "sandbox denied",
        message: "command failed",
      },
    })
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-error-chunk-provenance",
      "user_facing_error_text_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-error-chunk-provenance",
      "user_facing_error_delivery_blocked:llm_required",
    )
    expect(deliverTrackedChunk).not.toHaveBeenCalled()
  })

  it("records source and blocks direct delivery for root driver failure error chunks", async () => {
    const dependencies = {
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunFailure: vi.fn(),
      markAbortedRunCancelledIfActive: vi.fn(),
      onDeliveryError: vi.fn(),
    }
    const deliverChunk = vi.fn()

    await applyRootRunDriverFailure({
      runId: "run-root-driver-error-provenance",
      sessionId: "session-root-driver-error-provenance",
      source: "cli",
      onChunk: undefined,
      aborted: false,
      failure: new Error("boom"),
    }, dependencies, {
      applyFatalFailure: vi.fn(),
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-root-driver-error-provenance",
      "user_facing_error_text_source:runtime_deterministic",
    )
    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-root-driver-error-provenance",
      "user_facing_error_delivery_blocked:llm_required",
    )
    expect(deliverChunk).not.toHaveBeenCalled()
  })
})
