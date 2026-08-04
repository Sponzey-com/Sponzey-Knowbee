import { describe, expect, it, vi } from "vitest"
import {
  prepareRootExecutionCyclePassLaunch,
  prepareRootLoopEntryPassLaunch,
} from "../packages/core/src/runs/root-loop-pass-launch.ts"

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
    getDelegationTurnState: vi.fn(() => ({ usedTurns: 0, maxTurns: 3 })),
    getFinalizationDependencies: vi.fn(() => ({
      appendRunEvent: vi.fn(),
      setRunStepStatus: vi.fn(),
      updateRunStatus: vi.fn(),
      rememberRunSuccess: vi.fn(),
      rememberRunFailure: vi.fn(),
      onDeliveryError: vi.fn(),
    })),
    insertMessage: vi.fn(),
    writeReplyLog: vi.fn(),
    createId: vi.fn(() => "msg-1"),
    now: vi.fn(() => 123),
    runVerificationSubtask: vi.fn(async () => ({ ok: true, summary: "verified" })),
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    onDeliveryError: vi.fn(),
    onReviewError: vi.fn(),
    executeLoopDirective: vi.fn(async () => "break" as const),
    tryHandleActiveQueueCancellation: vi.fn(async () => null),
    tryHandleIntakeBridge: vi.fn(async () => null),
    getSyntheticApprovalAlreadyApproved: vi.fn(() => false),
    getAdmittedCapabilityExecutionScope: vi.fn(() => undefined),
    onBootstrapInfo: vi.fn(),
  }
}

describe("root loop pass launch", () => {
  it("binds loop-entry intake bridge to the current message", async () => {
    const dependencies = createDependencies()
    const launch = prepareRootLoopEntryPassLaunch({
      runId: "run-1",
      sessionId: "session-1",
      source: "cli",
      onChunk: undefined,
      pendingLoopDirective: null,
      intakeProcessed: false,
      currentMessage: "retry with more detail",
      recoveryBudgetUsage: {
        interpretation: 0,
        execution: 0,
        delivery: 0,
        external: 0,
      },
    }, dependencies as any)

    await launch.dependencies.tryHandleIntakeBridge()

    expect(dependencies.getFinalizationDependencies).toHaveBeenCalledTimes(1)
    expect(dependencies.tryHandleIntakeBridge).toHaveBeenCalledWith("retry with more detail")
  })

  it("prepares execution-cycle launch with delegated verification and approval state", async () => {
    const dependencies = createDependencies()
    const admittedCapabilityExecutionScope = {
      schemaVersion: 1 as const,
      runId: "run-1",
      ownerAgentId: "agent:main",
      receiptId: "receipt:selection:run-1",
      capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}` as const,
      selectedCapabilityId: "skill:web-research",
      toolNames: ["web_fetch", "web_search", "telegram_send_file"],
      selectedToolTargets: [{
        stepId: "step-delivery",
        capabilityId: "telegram_send_file",
        bindingTargetId: "agent:main",
        targetId: `destination:telegram:sha256:${"a".repeat(64)}`,
        toolNames: ["telegram_send_file"],
      }],
    }
    dependencies.getAdmittedCapabilityExecutionScope.mockReturnValue(
      admittedCapabilityExecutionScope,
    )
    const successfulTools = [{
      toolName: "web_fetch",
      output: "direct source evidence",
      evidenceSource: {
        sourceKind: "web" as const,
        sourceRef: `tool-result:web:${"a".repeat(64)}`,
        trustClass: "untrusted_external" as const,
        instructionIsolation: "data_only" as const,
      },
    }]
    const launch = prepareRootExecutionCyclePassLaunch({
      runId: "run-1",
      sessionId: "session-1",
      requestGroupId: "group-1",
      source: "telegram",
      onChunk: undefined,
      signal: new AbortController().signal,
      abortExecutionStream: vi.fn(),
      state: {
        currentMessage: "initial message",
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
        successfulTools,
      },
      executionSemantics: {
        filesystemEffect: "none",
        privilegedOperation: "not_required",
        artifactDelivery: "none",
        approvalRequired: false,
        approvalTool: "approve_run",
      },
      originalRequest: "original request",
      structuredRequest: {
        source_language: "en",
        normalized_english: "Do the work",
        target: "Do the work",
        to: "the current channel",
        context: ["Original user request: original request"],
        complete_condition: ["The requested work is completed."],
      },
      requestMessage: "initial message",
      workDir: "/tmp",
      isRootRequest: true,
      contextMode: "full",
      taskProfile: "general_chat",
      wantsDirectArtifactDelivery: false,
      requiresFilesystemMutation: false,
      requiresPrivilegedToolExecution: false,
      pendingToolParams: new Map<string, unknown>(),
      filesystemMutationPaths: new Set<string>(),
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
      priorAssistantMessages: [],
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
      defaultMaxDelegationTurns: 3,
    }, dependencies as any)

    expect(launch.params.syntheticApprovalAlreadyApproved).toBe(false)
    expect(launch.params.state.currentMessage).toContain("[Root Task Execution]")
    expect(launch.params.state.currentMessage).toContain("[checklist]")
    expect(launch.params.state.currentMessage).toContain("- [ ] Confirm goal:")
    expect(launch.params.completionConditions).toEqual(["The requested work is completed."])
    expect(launch.params.executionSemantics.artifactDelivery).toBe("direct")
    expect(launch.params.wantsDirectArtifactDelivery).toBe(true)
    expect(launch.params.successfulTools).toBe(successfulTools)
    expect(launch.params.admittedCapabilityExecutionScope).toBe(
      admittedCapabilityExecutionScope,
    )
    await launch.dependencies.runVerificationSubtask()
    expect(dependencies.runVerificationSubtask).toHaveBeenCalledTimes(1)
  })
})
