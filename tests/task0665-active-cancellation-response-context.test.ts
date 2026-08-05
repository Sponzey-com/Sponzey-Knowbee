import { afterEach, describe, expect, it, vi } from "vitest"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
  }
}

describe("task0665 active cancellation response context gate", () => {
  afterEach(() => {
    vi.doUnmock("../packages/core/src/runs/start-bridges.js")
    vi.doUnmock("../packages/core/src/runs/store.js")
    vi.resetModules()
  })

  it("passes active cancellation directives through the start loop directive response context", async () => {
    vi.resetModules()
    const finalizationDependencies = createFinalizationDependencies()
    const executeStartLoopDirective = vi.fn(async () => "break" as const)
    const buildStartFinalizationDependencies = vi.fn(() => finalizationDependencies)
    const runStartIntakeBridge = vi.fn()

    vi.doMock("../packages/core/src/runs/start-bridges.js", () => ({
      buildStartFinalizationDependencies,
      executeStartLoopDirective,
      runStartIntakeBridge,
    }))
    vi.doMock("../packages/core/src/runs/store.js", () => ({
      appendRunEvent: vi.fn(),
      cancelRootRun: vi.fn(() => false),
      clearActiveRunController: vi.fn(),
      createRootRun: vi.fn(),
      getRootRun: vi.fn(() => undefined),
      incrementDelegationTurnCount: vi.fn(),
      listActiveSessionRequestGroups: vi.fn(() => []),
      mergeRunPromptSourceSnapshot: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      updateRunSummary: vi.fn(),
    }))

    const { buildStartRootRunDriverDependencies } = await import(
      "../packages/core/src/runs/start-driver-dependencies.ts"
    )
    const { driverDependencies } = buildStartRootRunDriverDependencies({
      runId: "run-active-cancel",
      sessionId: "session-active-cancel",
      requestGroupId: "group-active-cancel",
      source: "telegram",
      onChunk: undefined,
      message: "지금 작업 취소해줘",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
      config: {
        orchestration: { maxDelegationTurns: 5 },
        security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
      },
      canonicalPolicyTools: [],
      reuseConversationContext: false,
      activeQueueCancellationMode: "latest",
      startNestedRootRun: vi.fn(() => ({ finished: Promise.resolve(undefined) })),
      syntheticApprovalScopes: new Set<string>(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    })

    const directive = await driverDependencies.tryHandleActiveQueueCancellation()
    expect(directive).toEqual(
      expect.objectContaining({
        kind: "complete",
        textSource: "runtime_deterministic",
        notice: expect.objectContaining({
          kind: "active_queue_cancellation",
          mode: "latest",
          textSource: "active_queue_cancellation_notice",
          finalAnswer: false,
          assistantIdentityClaim: false,
        }),
        eventLabel: "취소 요청 결과 전달",
      }),
    )
    if (!directive) throw new Error("expected active cancellation directive")

    await driverDependencies.executeLoopDirective(directive)

    expect(executeStartLoopDirective).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-active-cancel",
        sessionId: "session-active-cancel",
        source: "telegram",
        directive: expect.objectContaining({
          kind: "complete",
          textSource: "runtime_deterministic",
        }),
        responseContext: {
          originalRequest: "지금 작업 취소해줘",
          model: "gpt-test",
          providerId: "openai",
          workDir: "/tmp/project",
          config: {
            orchestration: { maxDelegationTurns: 5 },
            security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
          },
        },
        finalizationDependencies,
      }),
    )
  })
})
