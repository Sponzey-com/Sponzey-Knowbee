import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import { prepareRootExecutionCyclePassLaunch } from "../packages/core/src/runs/root-loop-pass-launch.ts"

function dependencies() {
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
    onBootstrapInfo: vi.fn(),
  }
}

function launchMessage(): string {
  const deps = dependencies()
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
  }, deps as any)

  return launch.params.state.currentMessage
}

describe("task0947 root execution wrapper prompt sources", () => {
  it("registers root execution wrapper fragments as file-backed internal sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const sourceIds = [
      "root_execution_header_user",
      "root_execution_intake_complete_intro_user",
      "root_execution_checklist_order_closing_user",
      "root_execution_incomplete_checklist_closing_user",
    ]

    for (const sourceId of sourceIds) {
      const source = registry.find((item) => item.sourceId === sourceId && item.locale === "en")
      expect(source).toMatchObject({ sourceId, usageScope: "internal", enabled: true })
      expect(source?.content).toContain("## Value")
      expect(source?.content).toContain("## Out Of Scope")
    }
  })

  it("renders only root wrapper Value sections into the root execution prompt", () => {
    const message = launchMessage()

    expect(message).toContain("[Root Task Execution]")
    expect(message).toContain("This request has completed intake and is now in the execution stage.")
    expect(message).toContain("Execute the actual work in checklist order.")
    expect(message).toContain("Do not stop while incomplete checklist items remain.")
    expect(message).not.toContain("# Root Execution Header")
    expect(message).not.toContain("## Value")
  })

  it("uses the shared prompt value helper and does not keep root wrapper bodies hardcoded", () => {
    const rootLoopSource = readFileSync("packages/core/src/runs/root-loop-pass-launch.ts", "utf-8")
    const requestPromptSource = readFileSync("packages/core/src/runs/request-prompt.ts", "utf-8")
    const actionExecutionSource = readFileSync("packages/core/src/runs/action-execution.ts", "utf-8")

    expect(rootLoopSource).toContain("root_execution_header_user")
    expect(rootLoopSource).toContain("root_execution_incomplete_checklist_closing_user")
    expect(rootLoopSource).not.toContain("[Root Task Execution]")
    expect(rootLoopSource).not.toContain("This request has completed intake and is now in the execution stage.")
    expect(rootLoopSource).not.toContain("Do not stop while incomplete checklist items remain.")
    expect(requestPromptSource).toContain('import { loadPromptValue } from "../memory/prompt-fragments.js"')
    expect(actionExecutionSource).toContain('import { loadPromptValue } from "../memory/prompt-fragments.js"')
  })
})
