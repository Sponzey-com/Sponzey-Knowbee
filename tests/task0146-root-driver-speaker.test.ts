import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { buildFinalResponseIdentityContext } from "../packages/core/src/runs/final-response-renderer.ts"
import { executeRootRunDriver } from "../packages/core/src/runs/root-run-driver.ts"
import { createTestRuntimeConfigFixture, type TestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempConfig(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0146-root-driver-speaker-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    ai: { connection: { provider: "ollama", endpoint: "http://127.0.0.1:11434", model: "llama3.2" } },
    webui: { enabled: true, host: "127.0.0.1", port: 18181, auth: { enabled: false } },
    security: { approvalMode: "off" },
    memory: { searchMode: "fts", sessionRetentionDays: 30 },
    scheduler: { enabled: false, timezone: "Asia/Seoul" }
  }`,
  })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

function createDriverDependencies(finalizationDependencies = createFinalizationDependencies()) {
  return {
    appendRunEvent: vi.fn(),
    updateRunSummary: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunFailure: vi.fn(),
    incrementDelegationTurnCount: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
    getDelegationTurnState: () => ({ usedTurns: 0, maxTurns: 3 }),
    getFinalizationDependencies: () => finalizationDependencies,
    insertMessage: vi.fn(),
    writeReplyLog: vi.fn(),
    createId: () => "message-1",
    now: () => 0,
    runVerificationSubtask: vi.fn(),
    rememberRunApprovalScope: vi.fn(),
    grantRunApprovalScope: vi.fn(),
    grantRunSingleApproval: vi.fn(),
    recordCanonicalAttempt: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalRecoveryReentry: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalCompletionOutcome: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
    stageCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
    consumeCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalCancellation: vi.fn(async () => ({
      ok: true as const,
      receiptRef: "receipt:cancellation:run:task0146:test",
    })),
    getCanonicalTerminalOutcome: vi.fn(() => null),
    getCanonicalTerminalEvidence: vi.fn(() => ({
      status: "evidence_missing" as const,
      reasonCode: "canonical_terminal_transition_missing" as const,
    })),
    admitCanonicalTopologyExecution: vi.fn(async () => ({ ok: true as const })),
    recordCanonicalTopologyResult: vi.fn(async () => ({
      ok: true as const,
      finalOutcome: "succeeded" as const,
    })),
    onDeliveryError: vi.fn(),
    executeLoopDirective: vi.fn(),
    tryHandleActiveQueueCancellation: vi.fn(async () => null),
    tryHandleIntakeBridge: vi.fn(async () => null),
    getSyntheticApprovalAlreadyApproved: () => false,
  }
}

function createModuleDependencies() {
  return {
    createExecutionLoopRuntimeState: ((input: { message: string }) => ({
      originalUserRequest: input.message,
      executionProfile: {
        structuredRequest: undefined,
        executionSemantics: undefined,
        wantsDirectArtifactDelivery: false,
      },
      requiresFilesystemMutation: false,
      requiresPrivilegedToolExecution: false,
      pendingToolParams: [],
      filesystemMutationPaths: [],
      seenFollowupPrompts: new Set(),
      seenCommandFailureRecoveryKeys: new Set(),
      seenExecutionRecoveryKeys: new Set(),
      seenDeliveryRecoveryKeys: new Set(),
      seenAiRecoveryKeys: new Set(),
      recoveryBudgetUsage: {},
      priorAssistantMessages: [],
      message: input.message,
    })) as never,
    prepareRootLoopLaunch: (() => ({
      rootLoopParams: {},
      rootLoopDependencies: {},
    })) as never,
    runRootLoop: vi.fn() as never,
    applyRootRunDriverFailure: vi.fn() as never,
    runTopologyRootRun: vi.fn(async (input) => {
      await input.onPlanningAdmitted?.({
        requestDiagnosisReceiptId: "diagnosis:task0146",
        solutionPlanReceiptId: "solution-plan:task0146",
        capabilitySelections: [
          { stepId: "inspect", capabilityRef: "capability:web.search" },
        ],
      })
      await input.onResultDiagnosed?.({
        resultDiagnosisReceiptId: "result-diagnosis:task0146",
      })
      return {
        ok: true,
        topologyRunId: "topology-run:task0146",
        topologyId: "topology:task0146",
        topologyVersion: 1,
        entryNodeId: "node:intake",
        entryNodeName: "Intake",
        finalAnswer: "토폴로지 실행 결과입니다.",
        nodeResultReport: {} as never,
        runtimeResult: {} as never,
        persistence: {} as never,
      }
    }),
  }
}

beforeEach(() => {
  useTempConfig()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0146 root driver speaker", () => {
  it("passes the main agent speaker snapshot from topology runtime completion to final delivery ledger details", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const driverDependencies = createDriverDependencies(finalizationDependencies)
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "토폴로지 실행 결과입니다." } as const
      }),
    }

    const moduleDependencies = createModuleDependencies()
    await executeRootRunDriver({
      artifactStorage: undefined as never,
      memoryJournal: undefined as never,
      runId: "run:task0146",
      sessionId: "session:task0146",
      requestGroupId: "group:task0146",
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      controller: new AbortController(),
      message: "서브 에이전트 구성으로 처리해줘",
      currentModel: "fake-model",
      currentProviderId: "fake-provider",
      currentProvider: provider,
      currentTargetId: "topology:task0146",
      currentTargetLabel: "Task0146 Topology",
      workDir: process.cwd(),
      config: runtimeFixture.config,
      finalResponseIdentityContext: buildFinalResponseIdentityContext({
        config: runtimeFixture.config,
        originalRequest: "서브 에이전트 구성으로 처리해줘",
        workDir: process.cwd(),
      }),
      reconnectNeedsClarification: false,
      queuedBehindRequestGroupRun: false,
      activeWorkerRuntime: undefined,
      isRootRequest: true,
      suppressFinalDelivery: false,
      contextMode: "isolated",
      taskProfile: "operations",
      topologyRouting: {
        mode: "route",
        reasonCode: "explicit_topology_target",
        featureFlagMode: "enforced",
        topologyId: "topology:task0146",
        topologyName: "Task0146 Topology",
        topologyVersion: 1,
        topologyVersionId: "topology-version:task0146:1",
        compiledTopologySnapshotId: "compiled:task0146",
        entryNodeId: "node:intake",
        selectedExecutorId: "node:intake",
        selectedConnectionPath: ["node:intake"],
        availableDirectChildExecutorIds: ["topology:task0146:node:intake"],
        entrySelection: "execution_decision",
        explicit: true,
      },
      speaker: {
        entityType: "knowbee",
        entityId: "agent:knowbee",
        agentNameSnapshot: "마당쇠",
      },
      syntheticApprovalRuntimeDependencies: {} as never,
      defaultMaxDelegationTurns: 3,
    }, driverDependencies, moduleDependencies)

    expect(moduleDependencies.runTopologyRootRun).toHaveBeenCalledWith(
      expect.objectContaining({
        planningAdmission: expect.objectContaining({
          required: true,
          diagnosisProvider: expect.any(Object),
          solutionPlanProvider: expect.any(Object),
        }),
      }),
    )
    expect(driverDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run:task0146",
      "runtime_solution_plan_provider:ready",
    )
    expect(driverDependencies.admitCanonicalTopologyExecution).toHaveBeenCalledTimes(1)
    expect(driverDependencies.admitCanonicalTopologyExecution).toHaveBeenCalledWith({
      runId: "run:task0146",
      route: expect.objectContaining({ topologyId: "topology:task0146" }),
      requestDiagnosisReceiptId: "diagnosis:task0146",
      solutionPlanReceiptId: "solution-plan:task0146",
      capabilitySelections: [
        { stepId: "inspect", capabilityRef: "capability:web.search" },
      ],
    })
    expect(JSON.stringify(driverDependencies.appendRunEvent.mock.calls)).not.toContain(
      "diagnosis:task0146",
    )
    expect(JSON.stringify(driverDependencies.appendRunEvent.mock.calls)).not.toContain(
      "solution-plan:task0146",
    )
    expect(JSON.stringify(driverDependencies.appendRunEvent.mock.calls)).not.toContain(
      "result-diagnosis:task0146",
    )
    expect(driverDependencies.setRunStepStatus.mock.calls).toEqual(
      expect.arrayContaining([
        ["run:task0146", "planning", "running", expect.any(String)],
        ["run:task0146", "executing", "running", expect.any(String)],
      ]),
    )

    const delivered = listMessageLedgerEvents({ runId: "run:task0146", limit: 100 }).find(
      (event) => event.event_kind === "final_answer_delivered",
    )
    expect(delivered).toBeDefined()
    const detail = JSON.parse(delivered?.detail_json ?? "{}") as {
      speaker?: Record<string, unknown>
    }

    expect(detail.speaker).toMatchObject({
      entityType: "knowbee",
      entityId: "agent:knowbee",
      agentNameSnapshot: "마당쇠",
    })
    expect(detail.speaker).not.toMatchObject({ agentNameSnapshot: "Knowbee" })
  })
})
