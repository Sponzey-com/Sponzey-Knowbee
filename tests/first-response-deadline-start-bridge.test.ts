import { afterEach, describe, expect, it, vi } from "vitest"

describe("first response deadline start bridge", () => {
  afterEach(() => {
    vi.doUnmock("../packages/core/src/runs/start-bridges.js")
    vi.resetModules()
  })

  it("passes one root deadline, monotonic clock, and cancellation signal to intake", async () => {
    vi.resetModules()
    const runStartIntakeBridge = vi.fn(async () => null)
    vi.doMock("../packages/core/src/runs/start-bridges.js", () => ({
      buildStartFinalizationDependencies: vi.fn(() => ({
        appendRunEvent: vi.fn(),
        setRunStepStatus: vi.fn(),
        updateRunStatus: vi.fn(),
        rememberRunSuccess: vi.fn(),
        rememberRunFailure: vi.fn(),
      })),
      executeStartLoopDirective: vi.fn(),
      runStartIntakeBridge,
    }))
    const { buildStartRootRunDriverDependencies } = await import(
      "../packages/core/src/runs/start-driver-dependencies.ts"
    )
    const controller = new AbortController()
    const monotonicNow = vi.fn(() => 1_000)
    const { driverDependencies } = buildStartRootRunDriverDependencies({
      artifactStorage: {} as never,
      memoryJournal: {} as never,
      hierarchyStorage: {} as never,
      runId: "run-deadline",
      controller,
      sessionId: "session-deadline",
      requestGroupId: "group-deadline",
      source: "webui",
      onChunk: undefined,
      message: "안녕",
      model: "test-model",
      workDir: "/tmp",
      config: {
        orchestration: { maxDelegationTurns: 3 },
        security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
      },
      canonicalPolicyTools: [],
      canonicalPolicySnapshotAt: 1,
      canonicalRuntimeHealthObservations: [],
      canonicalYeonjangAgentBindings: [],
      toolsEnabled: true,
      reuseConversationContext: false,
      activeQueueCancellationMode: null,
      startNestedRootRun: vi.fn(() => ({ finished: Promise.resolve(undefined) })),
      syntheticApprovalScopes: new Set<string>(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
      monotonicNow,
    })

    await driverDependencies.tryHandleIntakeBridge({
      currentMessage: "안녕",
      originalRequest: "안녕",
    })

    expect(monotonicNow).toHaveBeenCalledOnce()
    expect(runStartIntakeBridge).toHaveBeenCalledOnce()
    expect(runStartIntakeBridge.mock.calls[0]?.[0]).toMatchObject({
      signal: controller.signal,
      nowMs: monotonicNow,
      firstResponseDeadline: {
        receivedAtMs: 1_000,
        llmDeadlineAtMs: 25_000,
        validationDeadlineAtMs: 26_000,
        deliveryDeadlineAtMs: 30_000,
        expiresAtMs: 31_000,
      },
    })
  })
})
