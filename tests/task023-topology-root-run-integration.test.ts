import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  closeDb,
  getDb,
  insertSession,
  listMessageLedgerEvents,
} from "../packages/core/src/db/index.js"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { canonicalWorkIdForRootRun } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import {
  TOPOLOGY_RUNTIME_FEATURE_KEY,
  AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
  buildExampleEnterpriseTopology,
  createEnterpriseTopologyRegistry,
  listTopologyRuns,
  resolveTopologyRootRunRouting,
  runTopologyRootRun,
  setFeatureFlagMode,
  type EnterpriseTopology,
  type AgentExecutionDecision,
  type TopologyRootRunRoutingDecision,
} from "../packages/core/src/index.ts"
import {
  buildStartPlan,
  defaultStartPlanDependencies,
} from "../packages/core/src/runs/start-plan.ts"
import { buildStartRootRunDriverDependencies } from "../packages/core/src/runs/start-driver-dependencies.ts"
import { executeRootRunDriver } from "../packages/core/src/runs/root-run-driver.ts"
import {
  bindActiveRunController,
  clearActiveRunController,
  createRootRun,
  getRootRun,
} from "../packages/core/src/runs/store.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

function nestedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(nestedStrings)
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(nestedStrings)
  }
  return []
}

function structuredReportFromProviderInput(value: unknown): {
  result: string
  completedScope: string[]
  unresolvedScope: string[]
  verifiedReasonFacts: string[]
  nextActions: Array<{ text: string }>
} | undefined {
  const source = nestedStrings(value).find((text) => text.includes('"unresolvedScope"'))
  if (!source) return undefined
  const start = source.indexOf('{"schemaVersion":1')
  if (start < 0) return undefined
  let depth = 0
  let quoted = false
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (character === "\\") {
      escaped = true
      continue
    }
    if (character === '"') quoted = !quoted
    if (quoted) continue
    if (character === "{") depth += 1
    if (character === "}") depth -= 1
    if (depth === 0) return JSON.parse(source.slice(start, index + 1))
  }
  return undefined
}

const now = Date.UTC(2026, 3, 30, 13, 0, 0)
const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task023-topology-root-run-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function topologyFixture(): EnterpriseTopology {
  return structuredClone(buildExampleEnterpriseTopology(now))
}

function enableTopologyRuntime(): void {
  setFeatureFlagMode({
    featureKey: TOPOLOGY_RUNTIME_FEATURE_KEY,
    mode: "enforced",
    compatibilityMode: false,
    updatedBy: "task023-test",
    now,
  })
}

function activateTopology(topology: EnterpriseTopology = topologyFixture()) {
  const registry = createEnterpriseTopologyRegistry({ now: () => now })
  const appended = registry.appendTopologyVersion({
    topology,
    createdBy: "task023-test",
  })
  const activation = registry.activateTopologyVersion(topology.id, appended.version.version)
  expect(activation.ok).toBe(true)
  return { registry, topology, appended, activation }
}

function executionDecision(selectedExecutorId = "node:intake"): AgentExecutionDecision {
  return {
    contract_version: AGENT_EXECUTION_DECISION_CONTRACT_VERSION,
    current_executor_id: "agent:knowbee",
    domain: "task023_topology_root_run",
    behavior_pattern: "delegate",
    execution_route: "delegate_to_child",
    selected_executor_id: selectedExecutorId,
    selected_connection_path: [selectedExecutorId],
    task_profile: {
      title: "서브 에이전트 위임 실행",
      summary: "검증된 서브 에이전트 선택만 위임 실행으로 승격한다.",
      goals: ["선택된 서브 에이전트가 사용자 요청을 처리한다."],
      task_units: [
        {
          id: "task023-entry",
          title: "선택된 서브 에이전트 처리",
          goal: "선택된 서브 에이전트가 결과를 만든다.",
          preferred_executor_id: selectedExecutorId,
        },
      ],
      success_criteria: ["컴파일된 기본 엔트리에 의존하지 않는다."],
    },
    required_outputs: [
      {
        id: "answer",
        label: "사용자에게 전달할 처리 결과",
      },
    ],
    risk_boundary: {
      requires_user_approval: false,
      reason: "테스트용 실행자 선택",
    },
    confidence: 0.99,
    fallback_if_unavailable: "direct_current_agent",
    reason: "테스트가 선택한 실행자를 토폴로지 런타임에 전달합니다.",
  }
}

afterEach(() => {
  closeDb()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe("task023 topology root-run opt-in integration", () => {
  it("keeps the existing path when the topology feature flag is off", () => {
    useTempState()
    const { topology } = activateTopology()
    const decision = resolveTopologyRootRunRouting({
      message: "topology:customer-success 고객 요청 업무 처리",
      runId: "run:flag-off",
      sessionId: "session:task023",
      source: "webui",
      targetId: topology.id,
      isRootRequest: true,
    })

    expect(decision).toEqual(
      expect.objectContaining({
        mode: "fallback",
        reasonCode: "feature_flag_off",
        explicitTopologyId: topology.id,
      }),
    )
  })

  it("falls back when no active topology can be selected", async () => {
    useTempState()
    enableTopologyRuntime()
    const plan = await buildStartPlan(
      {
        config: runtimeFixture.config,
        message: "고객 응대 workflow를 처리해줘",
        sessionId: "session:no-active",
        runId: "run:no-active",
        source: "webui",
        taskProfile: "operations",
      },
      defaultStartPlanDependencies,
    )

    expect(plan.topologyRouting).toEqual(
      expect.objectContaining({
        mode: "fallback",
        reasonCode: "active_topology_not_found",
      }),
    )
    expect(plan.orchestrationMode).toBe("single_knowbee")
  })

  it("does not route explicit topology targets without a selected executor", async () => {
    useTempState()
    enableTopologyRuntime()
    const { topology } = activateTopology()
    const plan = await buildStartPlan(
      {
        config: runtimeFixture.config,
        message: "이 요청은 topology:customer-success 로 처리해줘",
        sessionId: "session:explicit",
        runId: "run:explicit",
        source: "webui",
        targetId: topology.id,
      },
      defaultStartPlanDependencies,
    )

    expect(plan.topologyRouting).toEqual(
      expect.objectContaining({
        mode: "fallback",
        reasonCode: "selected_executor_missing",
        explicitTopologyId: topology.id,
      }),
    )
  })

  it("runs the active topology node contract without creating a temporary Role agent", async () => {
    useTempState()
    enableTopologyRuntime()
    const { topology } = activateTopology()
    const decision = resolveTopologyRootRunRouting({
      message: "topology:customer-success 고객 요청 triage",
      runId: "run:harness",
      sessionId: "session:harness",
      source: "webui",
      targetId: topology.id,
      isRootRequest: true,
      executionDecision: executionDecision("node:intake"),
    })
    expect(decision.mode).toBe("route")

    const result = await runTopologyRootRun({
      decision: decision as Extract<TopologyRootRunRoutingDecision, { mode: "route" }>,
      runId: "run:harness",
      sessionId: "session:harness",
      source: "webui",
      message: "고객 요청 triage",
      now: () => now,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.entryNodeId).toBe("node:intake")
    expect(result.runtimeResult.envelope.subSessionCommandRequest.targetAgentId).toBe("node:intake")
    expect(result.runtimeResult.envelope.subSessionCommandRequest.targetAgentId).not.toMatch(
      /role|agent:role/i,
    )
    expect(result.persistence.topologyRunId).toBe("topology-run:run:harness")
    expect(listTopologyRuns({ rootRunId: "run:harness" })).toEqual([
      expect.objectContaining({
        topologyRunId: "topology-run:run:harness",
        rootRunId: "run:harness",
        entryNodeId: "node:intake",
      }),
    ])
  })

  it("completes a root run through topology runtime and delivers a Knowbee final answer", async () => {
    useTempState()
    enableTopologyRuntime()
    const { topology } = activateTopology()
    const decision = resolveTopologyRootRunRouting({
      message: "topology:customer-success 고객 요청 workflow를 처리해줘",
      runId: "run:topology-final",
      sessionId: "session:topology-final",
      source: "webui",
      targetId: topology.id,
      isRootRequest: true,
      executionDecision: executionDecision("node:intake"),
    })
    expect(decision.mode).toBe("route")
    insertSession({
      id: "session:topology-final",
      source: "webui",
      source_id: "task023",
      created_at: now,
      updated_at: now,
      summary: "task023 topology final",
    })
    createRootRun({
      id: "run:topology-final",
      sessionId: "session:topology-final",
      requestGroupId: "run:topology-final",
      prompt: "topology:customer-success 고객 요청 workflow를 처리해줘",
      source: "webui",
      targetId: topology.id,
      contextMode: "isolated",
      taskProfile: "operations",
      promptSourceSnapshot: { topologyRouting: decision },
      maxDelegationTurns: 3,
    })
    const chunks: Array<{ type?: string; delta?: string }> = []
    const generatedSolutionPlans: unknown[] = []
    const controller = new AbortController()
    const agentRuntime = createTestAgentRuntimeDependencies(runtimeFixture.rootDir)
    const finalResponseProvider = {
      chat: vi.fn(async function* (input: unknown) {
        const params = input as {
          messages?: Array<{ content?: string }>
          tools?: Array<{ name?: string }>
        }
        let promptPayload: { kind?: string; input?: { ownerAgentName?: string } } = {}
        try {
          promptPayload = JSON.parse(params.messages?.[0]?.content ?? "{}")
        } catch {
          promptPayload = {}
        }
        if (promptPayload.kind === "request_diagnosis") {
          yield {
            type: "tool_use",
            id: "tool:request-diagnosis",
            name: params.tools?.[0]?.name ?? "submit_request_diagnosis",
            input: {
              diagnosis_summary: "The topology request requires an execution plan.",
              intent: "execute_topology",
              goal: "Complete the topology request.",
              constraints: [],
              missing_information: [],
              risk: "none",
              confidence: "high",
              recommended_action: "plan",
              reason: "The topology has executable capabilities.",
            },
          } as const
          return
        }
        if (promptPayload.kind === "result_diagnosis") {
          yield {
            type: "tool_use",
            id: "tool:result-diagnosis",
            name: params.tools?.[0]?.name ?? "submit_result_diagnosis",
            input: {
              diagnosis_summary: "The topology result satisfies the requested criteria.",
              sufficiency: "sufficient",
              missing_information: [],
              conflicts: [],
              risk: "none",
              risks: [],
              confidence: "high",
              recommended_action: "final_report",
              reason: "The result contains verified topology output.",
            },
          } as const
          return
        }
        if (promptPayload.kind === "solution_plan") {
          const owner = promptPayload.input?.ownerAgentName ?? "Customer Request Intake"
          const solutionPlan = {
            ownerAgentName: owner,
            steps: [
              {
                step_id: "delegate",
                owner_agent_name: owner,
                action_type: "delegate",
                input_refs: ["request:user"],
                expected_output: "Delegated topology result",
                completion_criteria: "The child result is available for review.",
                status: "pending",
              },
              {
                step_id: "validate",
                owner_agent_name: owner,
                action_type: "validate",
                input_refs: ["step:delegate"],
                expected_output: "Verified topology result",
                completion_criteria: "The final result is verified against the request.",
                status: "pending",
              },
            ],
          }
          generatedSolutionPlans.push(solutionPlan)
          yield {
            type: "tool_use",
            id: "tool:solution-plan",
            name: params.tools?.[0]?.name ?? "submit_solution_plan",
            input: solutionPlan,
          } as const
          return
        }
        const report = structuredReportFromProviderInput(input)
        if (report?.result === "partial") {
          yield {
            type: "text_delta",
            delta: [
              "부분 처리 결과:",
              ...(report?.completedScope ?? []),
              ...(report?.unresolvedScope ?? []),
              ...(report?.verifiedReasonFacts ?? []),
              ...(report?.nextActions.map((action) => action.text) ?? []),
            ].join(" "),
          } as const
          return
        }
        yield { type: "text_delta", delta: "처리 결과: 위임 흐름 완료" } as const
      }),
    }
    bindActiveRunController("run:topology-final", controller)
    let topologyExecutionResult: Awaited<ReturnType<typeof runTopologyRootRun>> | undefined
    const { driverDependencies, syntheticApprovalRuntimeDependencies } =
      buildStartRootRunDriverDependencies({
        artifactStorage: agentRuntime.artifactStorage,
        memoryJournal: agentRuntime.memoryJournal,
        hierarchyStorage: undefined as never,
        runId: "run:topology-final",
        controller,
        sessionId: "session:topology-final",
        requestGroupId: "run:topology-final",
        source: "webui",
        onChunk: (chunk) => {
          chunks.push(chunk)
          return undefined
        },
        message: "topology:customer-success 고객 요청 workflow를 처리해줘",
        model: "gpt-test",
        provider: finalResponseProvider,
        workDir: process.cwd(),
        config: {
          orchestration: { maxDelegationTurns: 3 },
          security: { approvalTimeout: 30, approvalTimeoutFallback: "deny" },
        },
        canonicalPolicyTools: [],
        finalResponseIdentityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "Knowbee",
          promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `Knowbee`\n",
        },
        reuseConversationContext: false,
        activeQueueCancellationMode: null,
        startNestedRootRun: (() => ({ finished: Promise.resolve(undefined) })) as never,
        syntheticApprovalScopes: new Set(),
        logInfo: () => undefined,
        logWarn: () => undefined,
        logError: () => undefined,
      })
    await executeRootRunDriver(
      {
        artifactStorage: agentRuntime.artifactStorage,
        memoryJournal: agentRuntime.memoryJournal,
        runId: "run:topology-final",
        sessionId: "session:topology-final",
        requestGroupId: "run:topology-final",
        source: "webui",
        onChunk: (chunk) => {
          chunks.push(chunk)
          return undefined
        },
        controller,
        message: "topology:customer-success 고객 요청 workflow를 처리해줘",
        currentModel: "gpt-test",
        currentProviderId: undefined,
        currentProvider: finalResponseProvider,
        currentTargetId: topology.id,
        currentTargetLabel: topology.name,
        workDir: process.cwd(),
        config: runtimeFixture.config,
        finalResponseIdentityContext: {
          promptLocale: "ko",
          mainAgentSelfName: "Knowbee",
          promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `Knowbee`\n",
        },
        reconnectNeedsClarification: false,
        queuedBehindRequestGroupRun: false,
        activeWorkerRuntime: undefined,
        isRootRequest: true,
        contextMode: "isolated",
        taskProfile: "operations",
        topologyRouting: decision as Extract<TopologyRootRunRoutingDecision, { mode: "route" }>,
        syntheticApprovalRuntimeDependencies,
        defaultMaxDelegationTurns: 3,
      },
      driverDependencies,
      {
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
        runTopologyRootRun: async (input) => {
          topologyExecutionResult = await runTopologyRootRun(input)
          return topologyExecutionResult
        },
      },
    )
    clearActiveRunController("run:topology-final")
    const run = getRootRun("run:topology-final")
    const ledger = listMessageLedgerEvents({ runId: "run:topology-final", limit: 100 })
    const promptKinds = finalResponseProvider.chat.mock.calls.map(([input]) => {
      const params = input as { messages?: Array<{ content?: string }> }
      try {
        const payload = JSON.parse(params.messages?.[0]?.content ?? "{}") as { kind?: string }
        return payload.kind ?? "final_response"
      } catch {
        return "final_response"
      }
    })

    expect(topologyExecutionResult).toEqual(expect.objectContaining({ ok: true }))
    expect(promptKinds).toEqual(
      expect.arrayContaining(["request_diagnosis", "solution_plan", "result_diagnosis"]),
    )
    expect(generatedSolutionPlans).toEqual([
      expect.objectContaining({ ownerAgentName: "Customer Request Intake" }),
    ])
    expect(run).toEqual(
      expect.objectContaining({
        id: "run:topology-final",
        status: "completed",
        summary: expect.stringContaining("부분 처리 결과"),
      }),
    )
    expect(
      chunks.some((chunk) => chunk.type === "text" && chunk.delta?.includes("처리 결과:")),
    ).toBe(true)
    expect(
      chunks.some(
        (chunk) => chunk.type === "text" && chunk.delta?.includes("Knowbee final answer"),
      ),
    ).toBe(false)
    expect(ledger.map((event) => event.event_kind)).toContain("final_answer_delivered")
    expect(listTopologyRuns({ rootRunId: "run:topology-final" })).toEqual([
      expect.objectContaining({
        topologyId: "topology:customer-success",
        rootRunId: "run:topology-final",
      }),
    ])
    const canonical = new SqliteCanonicalWorkRepository(getDb(), () => now).load(
      canonicalWorkIdForRootRun("run:topology-final"),
    )
    expect(canonical).toMatchObject({ state: "USER_REPORT", revision: 6 })
    expect(canonical?.transitions.at(-1)).toMatchObject({
      event: "REPORT_DELIVERED",
      previousState: "PARTIALLY_SUCCEEDED",
      nextState: "USER_REPORT",
    })
  })

  it("falls back to the existing root loop when topology runtime fails", async () => {
    useTempState()
    const agentRuntime = createTestAgentRuntimeDependencies(runtimeFixture.rootDir)
    const runRootLoop = vi.fn(async () => undefined)
    const appendRunEvent = vi.fn()
    const updateRunSummary = vi.fn()
    const setRunStepStatus = vi.fn()
    const recordCanonicalRecoveryReentry = vi.fn(async () => ({ ok: true as const }))
    await executeRootRunDriver(
      {
        artifactStorage: agentRuntime.artifactStorage,
        memoryJournal: agentRuntime.memoryJournal,
        runId: "run:fallback",
        sessionId: "session:fallback",
        requestGroupId: "run:fallback",
        source: "webui",
        onChunk: undefined,
        controller: new AbortController(),
        message: "topology:customer-success 실패 fallback",
        currentModel: undefined,
        currentProviderId: undefined,
        currentProvider: undefined,
        currentTargetId: "topology:customer-success",
        currentTargetLabel: "Customer Success",
        workDir: process.cwd(),
        config: runtimeFixture.config,
        reconnectNeedsClarification: false,
        queuedBehindRequestGroupRun: false,
        activeWorkerRuntime: undefined,
        isRootRequest: true,
        contextMode: "isolated",
        taskProfile: "operations",
        topologyRouting: {
          mode: "route",
          reasonCode: "explicit_topology_target",
          featureFlagMode: "enforced",
          topologyId: "topology:customer-success",
          topologyName: "Customer Success Topology",
          topologyVersion: 1,
          topologyVersionId: "topology-version:customer-success:1",
          compiledTopologySnapshotId: "compiled:task023",
          entryNodeId: "node:intake",
          selectedExecutorId: "node:intake",
          selectedConnectionPath: ["node:intake"],
          availableDirectChildExecutorIds: ["topology:customer-success:node:intake"],
          entrySelection: "execution_decision",
          explicit: true,
        },
        syntheticApprovalRuntimeDependencies: {} as never,
        defaultMaxDelegationTurns: 3,
      },
      {
        appendRunEvent,
        updateRunSummary,
        setRunStepStatus,
        updateRunStatus: vi.fn(),
        rememberRunFailure: vi.fn(),
        incrementDelegationTurnCount: vi.fn(),
        markAbortedRunCancelledIfActive: vi.fn(),
        getDelegationTurnState: () => ({ usedTurns: 0, maxTurns: 3 }),
        getFinalizationDependencies: vi.fn(),
        insertMessage: vi.fn(),
        writeReplyLog: vi.fn(),
        createId: () => "id",
        now: () => now,
        runVerificationSubtask: vi.fn(),
        rememberRunApprovalScope: vi.fn(),
        grantRunApprovalScope: vi.fn(),
        grantRunSingleApproval: vi.fn(),
        admitCanonicalTopologyExecution: vi.fn(async () => ({ ok: true as const })),
        recordCanonicalTopologyResult: vi.fn(async () => ({ ok: true as const, finalOutcome: "partial" as const })),
        recordCanonicalCancellation: vi.fn(async () => ({
          ok: true as const,
          receiptRef: "receipt:cancellation:run:task023:test",
        })),
        getCanonicalTerminalOutcome: vi.fn(() => null),
        getCanonicalTerminalEvidence: vi.fn(() => ({
          status: "evidence_missing" as const,
          reasonCode: "canonical_terminal_transition_missing" as const,
        })),
        recordCanonicalRecoveryReentry,
        recordCanonicalAttempt: vi.fn(async () => ({ ok: true as const })),
        executeLoopDirective: vi.fn(),
        tryHandleActiveQueueCancellation: vi.fn(async () => null),
        tryHandleIntakeBridge: vi.fn(async () => null),
        getSyntheticApprovalAlreadyApproved: () => false,
      },
      {
        createExecutionLoopRuntimeState: ((input: unknown) => ({
          originalUserRequest: "topology failure",
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
          message: (input as { message: string }).message,
        })) as never,
        prepareRootLoopLaunch: (() => ({
          rootLoopParams: {},
          rootLoopDependencies: {},
        })) as never,
        runRootLoop: runRootLoop as never,
        applyRootRunDriverFailure: vi.fn() as never,
        runTopologyRootRun: vi.fn(async () => ({
          ok: false,
          reasonCode: "topology_runtime_failed",
          fallbackSummary: "Topology failed; existing path should continue.",
          issues: ["forced_failure"],
        })) as never,
      },
    )

    expect(appendRunEvent).toHaveBeenCalledWith(
      "run:fallback",
      expect.stringContaining("topology_runtime_fallback"),
    )
    expect(updateRunSummary).toHaveBeenCalledWith(
      "run:fallback",
      "Topology failed; existing path should continue.",
    )
    expect(runRootLoop).toHaveBeenCalledTimes(1)
    expect(recordCanonicalRecoveryReentry).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run:fallback",
        strategy: expect.objectContaining({ targetId: "agent:knowbee" }),
      }),
    )
  })
})
