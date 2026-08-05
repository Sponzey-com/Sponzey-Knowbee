import { describe, expect, it, vi } from "vitest"
import { executeRootRunDriver } from "../packages/core/src/runs/root-run-driver.ts"

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
    getDelegationTurnState: vi.fn(() => ({ usedTurns: 0, maxTurns: 5 })),
    getFinalizationDependencies: vi.fn(() => ({
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunSuccess: vi.fn(),
      rememberRunFailure: vi.fn(),
      onDeliveryError: vi.fn(),
    })),
    insertMessage: vi.fn() as any,
    writeReplyLog: vi.fn() as any,
    createId: vi.fn(() => "generated-id"),
    now: vi.fn(() => 123),
    runVerificationSubtask: vi.fn(async () => ({ ok: true, summary: "verified" })),
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    onDeliveryError: vi.fn(),
    onReviewError: vi.fn(),
    recordCanonicalAttempt: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalRecoveryReentry: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalCompletionOutcome: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
    stageCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
    consumeCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalCancellation: vi.fn(async () => ({
      ok: true as const,
      receiptRef: "receipt:cancellation:run-1:test",
    })),
    getCanonicalTerminalOutcome: vi.fn(() => null),
    getCanonicalTerminalEvidence: vi.fn(() => ({
      status: "evidence_missing" as const,
      reasonCode: "canonical_terminal_transition_missing" as const,
    })),
    admitCanonicalTopologyExecution: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalTopologyResult: vi.fn(async () => ({ ok: true as const, finalOutcome: "partial" as const })),
    executeLoopDirective: vi.fn(async () => "break" as const),
    tryHandleActiveQueueCancellation: vi.fn(async () => null),
    tryHandleIntakeBridge: vi.fn(async () => null),
    getSyntheticApprovalAlreadyApproved: vi.fn(() => false),
    onBootstrapInfo: vi.fn(),
    onFinally: vi.fn(),
  }
}

function createParams() {
  return {
    runId: "run-1",
    sessionId: "session-1",
    requestGroupId: "group-1",
    source: "cli" as const,
    onChunk: undefined,
    controller: new AbortController(),
    message: "Do the work",
    originalRequest: "Original request",
    currentModel: "gpt-5",
    currentProviderId: "provider:openai",
    currentProvider: undefined,
    currentTargetId: "provider:openai",
    currentTargetLabel: "OpenAI",
    workDir: "/tmp/work",
    reconnectNeedsClarification: false,
    queuedBehindRequestGroupRun: false,
    activeWorkerRuntime: undefined,
    isRootRequest: true,
    contextMode: "isolated" as const,
    taskProfile: "general_chat" as const,
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
    defaultMaxDelegationTurns: 5,
  }
}

describe("execute root run driver", () => {
  it("re-enters request analysis without recording an attempt when topology planning is blocked", async () => {
    const dependencies = createDependencies()
    const params = {
      ...createParams(),
      topologyRouting: {
        mode: "route" as const,
        reasonCode: "explicit_topology_target" as const,
        featureFlagMode: "enforced" as const,
        topologyId: "topology:test",
        topologyName: "Test",
        topologyVersion: 1,
        topologyVersionId: "version:1",
        compiledTopologySnapshotId: "snapshot:1",
        entryNodeId: "node:entry",
        selectedExecutorId: "node:entry",
        selectedConnectionPath: ["node:entry"],
        availableDirectChildExecutorIds: ["node:entry"],
        explicit: true,
      },
    }
    const runRootLoop = vi.fn()

    await executeRootRunDriver(params, dependencies as never, {
      createExecutionLoopRuntimeState: vi.fn(() => ({
        executionProfile: {},
        originalUserRequest: params.message,
      })),
      prepareRootLoopLaunch: vi.fn(() => ({ rootLoopParams: {}, rootLoopDependencies: {} })),
      runRootLoop,
      applyRootRunDriverFailure: vi.fn(),
      runTopologyRootRun: vi.fn(async () => ({
        ok: false,
        reasonCode: "planning_admission_blocked",
        fallbackSummary: "Reanalyze the request.",
        issues: ["canonical_planning_persistence_failed"],
      })),
    } as never)

    expect(dependencies.recordCanonicalTopologyResult).not.toHaveBeenCalled()
    expect(dependencies.recordCanonicalRecoveryReentry).not.toHaveBeenCalled()
    expect(runRootLoop).toHaveBeenCalledTimes(1)
  })

  it("records an execution attempt and re-enters analysis when result diagnosis is blocked", async () => {
    const dependencies = createDependencies()
    const params = {
      ...createParams(),
      topologyRouting: {
        mode: "route" as const,
        reasonCode: "explicit_topology_target" as const,
        featureFlagMode: "enforced" as const,
        topologyId: "topology:test",
        topologyName: "Test",
        topologyVersion: 1,
        topologyVersionId: "version:1",
        compiledTopologySnapshotId: "snapshot:1",
        entryNodeId: "node:entry",
        selectedExecutorId: "node:entry",
        selectedConnectionPath: ["node:entry"],
        availableDirectChildExecutorIds: ["node:entry"],
        explicit: true,
      },
    }
    const runRootLoop = vi.fn()
    const result = {
      ok: false as const,
      reasonCode: "result_diagnosis_reanalysis_required" as const,
      fallbackSummary: "Reanalyze the incomplete result.",
      issues: ["result_diagnosis_invalid"],
    }

    await executeRootRunDriver(params, dependencies as never, {
      createExecutionLoopRuntimeState: vi.fn(() => ({
        executionProfile: {},
        originalUserRequest: params.message,
      })),
      prepareRootLoopLaunch: vi.fn(() => ({ rootLoopParams: {}, rootLoopDependencies: {} })),
      runRootLoop,
      applyRootRunDriverFailure: vi.fn(),
      runTopologyRootRun: vi.fn(async () => result),
    } as never)

    expect(dependencies.recordCanonicalTopologyResult).toHaveBeenCalledWith({
      runId: params.runId,
      result,
    })
    expect(dependencies.recordCanonicalRecoveryReentry).toHaveBeenCalledTimes(1)
    expect(runRootLoop).toHaveBeenCalledTimes(1)
  })

  it("preserves canonical user-input waiting instead of projecting a generic failure", async () => {
    const dependencies = createDependencies()
    const params = { ...createParams(), suppressFinalDelivery: true }
    dependencies.getCanonicalTerminalOutcome.mockReturnValue("user_input")
    const applyRootRunDriverFailure = vi.fn()

    await executeRootRunDriver(params, dependencies as any, {
      createExecutionLoopRuntimeState: vi.fn(() => ({
        executionProfile: {},
        originalUserRequest: params.message,
      })),
      prepareRootLoopLaunch: vi.fn(() => ({ rootLoopParams: {}, rootLoopDependencies: {} })),
      runRootLoop: vi.fn(async () => {
        throw new Error("canonical_policy_input_required")
      }),
      applyRootRunDriverFailure,
    } as any)

    expect(applyRootRunDriverFailure).not.toHaveBeenCalled()
    expect(dependencies.updateRunStatus).not.toHaveBeenCalledWith(
      "run-1",
      "failed",
      expect.any(String),
      false,
    )
  })

  it("does not claim policy blocking when terminal evidence is missing", async () => {
    const dependencies = createDependencies()
    const params = { ...createParams(), suppressFinalDelivery: true }
    dependencies.getCanonicalTerminalOutcome.mockReturnValue("blocked")
    const applyRootRunDriverFailure = vi.fn()

    await executeRootRunDriver(params, dependencies as any, {
      createExecutionLoopRuntimeState: vi.fn(() => ({
        executionProfile: {},
        originalUserRequest: params.message,
      })),
      prepareRootLoopLaunch: vi.fn(() => ({ rootLoopParams: {}, rootLoopDependencies: {} })),
      runRootLoop: vi.fn(async () => {
        throw new Error("canonical policy outcome")
      }),
      applyRootRunDriverFailure,
    } as any)

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      params.runId,
      "canonical_blocked_terminal_evidence_rejected:canonical_terminal_transition_missing",
    )
    expect(applyRootRunDriverFailure).toHaveBeenCalledTimes(1)
  })

  it("records canonical cancellation before applying aborted root failure", async () => {
    const dependencies = createDependencies()
    const params = { ...createParams(), suppressFinalDelivery: true }
    const order: string[] = []
    dependencies.recordCanonicalCancellation.mockImplementation(async () => {
      order.push("canonical-cancelled")
      return { ok: true as const, receiptRef: "receipt:cancellation:run-1:test" }
    })
    const applyRootRunDriverFailure = vi.fn(async () => {
      order.push("failure-projection")
    })

    await executeRootRunDriver(params, dependencies as any, {
      createExecutionLoopRuntimeState: vi.fn(() => ({
        executionProfile: {},
        originalUserRequest: params.message,
      })),
      prepareRootLoopLaunch: vi.fn(() => ({ rootLoopParams: {}, rootLoopDependencies: {} })),
      runRootLoop: vi.fn(async () => {
        params.controller.abort()
        throw new Error("aborted")
      }),
      applyRootRunDriverFailure,
    } as any)

    expect(dependencies.recordCanonicalCancellation).toHaveBeenCalledWith({
      runId: "run-1",
      cancellationKind: "runtime_abort",
      signalAborted: true,
    })
    expect(order).toEqual(["canonical-cancelled", "failure-projection"])
  })

  it("wraps verification and intake bridge with the resolved original request", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionLoopRuntimeState: vi.fn((params) => ({
        executionProfile: {
          originalRequest: params.originalRequest ?? params.message,
          structuredRequest: {
            source_language: "en",
            normalized_english: params.message,
            target: params.message,
            to: "the current channel",
            context: [],
            complete_condition: [],
          },
          intentEnvelope: {
            intent_type: "task_intake",
            source_language: "en",
            normalized_english: params.message,
            target: params.message,
            destination: "the current channel",
            context: [],
            complete_condition: [],
            schedule_spec: {
              detected: false,
              kind: "none",
              status: "not_applicable",
              schedule_text: "",
            },
            execution_semantics: {
              filesystemEffect: "none",
              privilegedOperation: "none",
              artifactDelivery: "none",
              approvalRequired: false,
              approvalTool: "external_action",
            },
            delivery_mode: "none",
            requires_approval: false,
            approval_tool: "external_action",
            preferred_target: "auto",
            needs_tools: false,
            needs_web: false,
          },
          executionSemantics: {
            filesystemEffect: "none",
            privilegedOperation: "none",
            artifactDelivery: "none",
            approvalRequired: false,
            approvalTool: "external_action",
          },
          requiresFilesystemMutation: false,
          requiresPrivilegedToolExecution: false,
          wantsDirectArtifactDelivery: false,
          approvalRequired: false,
          approvalTool: "external_action",
        },
        originalUserRequest: params.originalRequest ?? params.message,
        priorAssistantMessages: [],
        seenFollowupPrompts: new Set<string>(),
        seenCommandFailureRecoveryKeys: new Set<string>(),
        seenExecutionRecoveryKeys: new Set<string>(),
        seenDeliveryRecoveryKeys: new Set<string>(),
        seenAiRecoveryKeys: new Set<string>(),
        recoveryBudgetUsage: {
          interpretation: 0,
          execution: 0,
          delivery: 0,
          external: 0,
        },
        requiresFilesystemMutation: false,
        requiresPrivilegedToolExecution: false,
        pendingToolParams: new Map<string, unknown>(),
        filesystemMutationPaths: new Set<string>(["a.txt"]),
      })),
      prepareRootLoopLaunch: vi.fn((_params, _dependencies, runtime) => ({
        rootLoopParams: {} as any,
        rootLoopDependencies: {
          runVerificationSubtask: async () =>
            dependencies.runVerificationSubtask({
              originalRequest: runtime.originalUserRequest,
              mutationPaths: [...runtime.filesystemMutationPaths],
            }),
          tryHandleIntakeBridge: async (currentMessage: string) =>
            dependencies.tryHandleIntakeBridge({
              currentMessage,
              originalRequest: runtime.originalUserRequest,
            }),
        } as any,
      })),
      runRootLoop: vi.fn(async (_params, rootLoopDependencies) => {
        await rootLoopDependencies.runVerificationSubtask()
        await rootLoopDependencies.tryHandleIntakeBridge("retry with more detail")
        return {
          currentMessage: "done",
          currentModel: "gpt-5",
          currentProviderId: "provider:openai",
          currentProvider: undefined,
          currentTargetId: "provider:openai",
          currentTargetLabel: "OpenAI",
          activeWorkerRuntime: undefined,
          executionRecoveryLimitStop: null,
          aiRecoveryLimitStop: null,
          sawRealFilesystemMutation: false,
          filesystemMutationRecoveryAttempted: false,
          truncatedOutputRecoveryAttempted: false,
        }
      }),
      applyRootRunDriverFailure: vi.fn(async () => undefined),
    }

    await executeRootRunDriver(createParams(), dependencies as any, moduleDependencies as any)

    expect(dependencies.runVerificationSubtask).toHaveBeenCalledWith({
      originalRequest: "Original request",
      mutationPaths: ["a.txt"],
    })
    expect(dependencies.tryHandleIntakeBridge).toHaveBeenCalledWith({
      currentMessage: "retry with more detail",
      originalRequest: "Original request",
    })
    expect(dependencies.onFinally).toHaveBeenCalledTimes(1)
  })

  it("applies fatal failure and delivers an error chunk when root loop throws", async () => {
    const dependencies = createDependencies()
    const moduleDependencies = {
      createExecutionLoopRuntimeState: vi.fn((params) => ({
        executionProfile: {
          originalRequest: params.originalRequest ?? params.message,
          structuredRequest: {
            source_language: "en",
            normalized_english: params.message,
            target: params.message,
            to: "the current channel",
            context: [],
            complete_condition: [],
          },
          intentEnvelope: {
            intent_type: "task_intake",
            source_language: "en",
            normalized_english: params.message,
            target: params.message,
            destination: "the current channel",
            context: [],
            complete_condition: [],
            schedule_spec: {
              detected: false,
              kind: "none",
              status: "not_applicable",
              schedule_text: "",
            },
            execution_semantics: {
              filesystemEffect: "none",
              privilegedOperation: "none",
              artifactDelivery: "none",
              approvalRequired: false,
              approvalTool: "external_action",
            },
            delivery_mode: "none",
            requires_approval: false,
            approval_tool: "external_action",
            preferred_target: "auto",
            needs_tools: false,
            needs_web: false,
          },
          executionSemantics: {
            filesystemEffect: "none",
            privilegedOperation: "none",
            artifactDelivery: "none",
            approvalRequired: false,
            approvalTool: "external_action",
          },
          requiresFilesystemMutation: false,
          requiresPrivilegedToolExecution: false,
          wantsDirectArtifactDelivery: false,
          approvalRequired: false,
          approvalTool: "external_action",
        },
        originalUserRequest: params.originalRequest ?? params.message,
        priorAssistantMessages: [],
        seenFollowupPrompts: new Set<string>(),
        seenCommandFailureRecoveryKeys: new Set<string>(),
        seenExecutionRecoveryKeys: new Set<string>(),
        seenDeliveryRecoveryKeys: new Set<string>(),
        seenAiRecoveryKeys: new Set<string>(),
        recoveryBudgetUsage: {
          interpretation: 0,
          execution: 0,
          delivery: 0,
          external: 0,
        },
        requiresFilesystemMutation: false,
        requiresPrivilegedToolExecution: false,
        pendingToolParams: new Map<string, unknown>(),
        filesystemMutationPaths: new Set<string>(),
      })),
      prepareRootLoopLaunch: vi.fn((_params, _dependencies, runtime) => ({
        rootLoopParams: {} as any,
        rootLoopDependencies: {} as any,
      })),
      runRootLoop: vi.fn(async () => {
        throw new Error(
          "boom token=sk-root-driver-secret-1234567890 at /Users/me/private/root-run-driver.ts",
        )
      }),
      applyRootRunDriverFailure: vi.fn(async () => undefined),
    }

    await executeRootRunDriver(createParams(), dependencies as any, moduleDependencies as any)

    expect(moduleDependencies.applyRootRunDriverFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        sessionId: "session-1",
        source: "cli",
        message: "boom token=*** at [internal-path-redacted]",
        aborted: false,
      }),
      expect.any(Object),
    )
    expect(JSON.stringify(moduleDependencies.applyRootRunDriverFailure.mock.calls)).not.toContain(
      "sk-root-driver-secret",
    )
    expect(JSON.stringify(moduleDependencies.applyRootRunDriverFailure.mock.calls)).not.toContain(
      "/Users/me/private",
    )
    expect(dependencies.onFinally).toHaveBeenCalledTimes(1)
  })
})
