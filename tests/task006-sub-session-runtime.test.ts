import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import { listLatencyMetrics, resetLatencyMetrics } from "../packages/core/src/observability/latency.js"
import type {
  AgentPromptBundle,
  CommandRequest,
  ExpectedOutputContract,
  MemoryPolicy,
  PermissionProfile,
  ResourceLockContract,
  RuntimeIdentity,
  SkillMcpAllowlist,
  StructuredTaskScope,
  SubSessionContract,
  SubSessionStatus,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  ResourceLockManager,
  SubSessionRunner,
  buildSubSessionContract,
  createTextResultReport,
  planSubSessionExecutionWaves,
  recoverInterruptedSubSessions,
  runParallelSubSessionGroup,
  type RunSubSessionInput,
  type SubSessionRunOutcome,
  type SubSessionRuntimeDependencies,
} from "../packages/core/src/orchestration/sub-session-runner.ts"
import {
  buildSubSessionProgressSummary,
  type SubSessionProgressAggregationItem,
} from "../packages/core/src/orchestration/sub-session-progress-aggregation.ts"
import { createTestSubSessionMemoryDependencies } from "./fixtures/sub-session-runtime.ts"
import { createTestResultDiagnosisDependencies } from "./fixtures/agent-runtime.ts"

const now = Date.UTC(2026, 3, 20, 0, 0, 0)

const expectedOutput: ExpectedOutputContract = {
  outputId: "answer",
  kind: "text",
  description: "Answer returned to Knowbee review.",
  required: true,
  acceptance: {
    requiredEvidenceKinds: [],
    artifactRequired: false,
    reasonCodes: ["reviewable_result"],
  },
}

const taskScope: StructuredTaskScope = {
  goal: "Collect a small result for parent review.",
  intentType: "runtime_test",
  actionType: "sub_session_runtime",
  constraints: ["Do not deliver directly to the user."],
  expectedOutputs: [expectedOutput],
  reasonCodes: ["runtime_test"],
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["research"],
  enabledMcpServerIds: ["browser"],
  enabledToolNames: ["web_search"],
  disabledToolNames: ["shell_exec"],
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const memoryPolicy: MemoryPolicy = {
  owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
  visibility: "private",
  readScopes: [{ ownerType: "sub_agent", ownerId: "agent:researcher" }],
  writeScope: { ownerType: "sub_agent", ownerId: "agent:researcher" },
  retentionPolicy: "short_term",
  writebackReviewRequired: true,
}

function identity(entityType: RuntimeIdentity["entityType"], entityId: string, idempotencyKey = `idem:${entityId}`): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType,
    entityId,
    owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
    idempotencyKey,
    auditCorrelationId: `audit:${entityId}`,
    parent: {
      parentRunId: "run-parent",
      parentRequestId: "request-parent",
    },
  }
}

function promptBundle(bundleId = "prompt-bundle:researcher"): AgentPromptBundle {
  return {
    identity: identity("sub_session", bundleId, `idem:${bundleId}`),
    bundleId,
    agentId: "agent:researcher",
    agentType: "sub_agent",
    role: "research worker",
    personalitySnapshot: "Precise",
    teamContext: [],
    memoryPolicy,
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    modelProfileSnapshot: {
      providerId: "openai",
      modelId: "gpt-5.4-mini",
      maxOutputTokens: 1024,
    },
    taskScope,
    safetyRules: ["Do not deliver sub-session results directly to the user."],
    sourceProvenance: [{ sourceId: "profile:agent:researcher", version: "1" }],
    createdAt: now,
  }
}

function command(id: string): CommandRequest {
  return {
    identity: identity("sub_session", id, `idem:${id}`),
    commandRequestId: `command:${id}`,
    parentRunId: "run-parent",
    subSessionId: `sub:${id}`,
    targetAgentId: "agent:researcher",
    taskScope,
    contextPackageIds: [],
    expectedOutputs: [expectedOutput],
  }
}

function runInput(id: string, overrides: Partial<RunSubSessionInput> = {}): RunSubSessionInput {
  return {
    command: command(id),
    agent: {
      agentId: "agent:researcher",
      agentName: "Research Agent",
      displayName: "Legacy Researcher Display",
      nickname: "Legacy Res",
    },
    parentSessionId: "session-parent",
    promptBundle: promptBundle(),
    ...overrides,
  }
}

function makeMemoryDependencies() {
  const sessions = new Map<string, SubSessionContract>()
  const events: Array<{ parentRunId: string; label: string }> = []
  const cancelledParents = new Set<string>()
  let time = now
  const clone = <T>(value: T): T => structuredClone(value)
  const dependencies: SubSessionRuntimeDependencies = {
    ...createTestSubSessionMemoryDependencies(),
    ...createTestResultDiagnosisDependencies(),
    now: () => {
      time += 1
      return time
    },
    idProvider: () => `id-${time += 1}`,
    loadSubSessionByIdempotencyKey: (idempotencyKey) =>
      clone([...sessions.values()].find((session) => session.identity.idempotencyKey === idempotencyKey)),
    persistSubSession: (subSession) => {
      if ([...sessions.values()].some((session) => session.identity.idempotencyKey === subSession.identity.idempotencyKey)) {
        return false
      }
      sessions.set(subSession.subSessionId, clone(subSession))
      return true
    },
    updateSubSession: (subSession) => {
      sessions.set(subSession.subSessionId, clone(subSession))
    },
    appendParentEvent: (parentRunId, label) => {
      events.push({ parentRunId, label })
    },
    isParentCancelled: (parentRunId) => cancelledParents.has(parentRunId),
  }
  return { dependencies, sessions, events, cancelledParents }
}

function outcome(taskId: string, status: SubSessionStatus = "completed"): SubSessionRunOutcome {
  return {
    subSession: {
      identity: identity("sub_session", `sub:${taskId}`, `idem:${taskId}`),
      subSessionId: `sub:${taskId}`,
      parentSessionId: "session-parent",
      parentRunId: "run-parent",
      agentId: "agent:researcher",
      agentName: "Researcher",
      commandRequestId: `command:${taskId}`,
      status,
      promptBundleId: "prompt-bundle:researcher",
    },
    status,
    replayed: false,
  }
}

function exclusiveFileLock(lockId: string, target = "/repo/file.ts"): ResourceLockContract {
  return {
    lockId,
    kind: "file",
    target,
    mode: "exclusive",
    reasonCode: "write_conflict",
  }
}

describe("task006 sub-session runtime", () => {
  beforeEach(() => {
    resetLatencyMetrics()
  })

  afterEach(() => {
    resetLatencyMetrics()
  })

  it("creates and completes sub-sessions under the same parent run", async () => {
    const { dependencies, sessions, events } = makeMemoryDependencies()
    const runner = new SubSessionRunner(dependencies)
    let firstProgress: { speaker?: { agentNameSnapshot?: string; nicknameSnapshot?: string } } | undefined

    const first = await runner.runSubSession(runInput("one"), async (input, controls) => {
      firstProgress = await controls.emitProgress("first progress")
      return createTextResultReport({ command: input.command, text: "first result" })
    })
    const second = await runner.runSubSession(runInput("two"), async (input) =>
      createTextResultReport({ command: input.command, text: "second result" }))

    expect(first.status).toBe("completed")
    expect(firstProgress?.speaker).toMatchObject({ agentNameSnapshot: "Research Agent" })
    expect(firstProgress?.speaker).not.toHaveProperty("nicknameSnapshot")
    expect(second.status).toBe("completed")
    expect([...sessions.values()].map((session) => session.parentRunId)).toEqual(["run-parent", "run-parent"])
    expect(events.map((event) => event.label)).toEqual(expect.arrayContaining([
      "sub_session_created:sub:one",
      "sub_session_progress:sub:one:first progress",
      "sub_session_result:sub:one:completed",
      "sub_session_created:sub:two",
      "sub_session_result:sub:two:completed",
    ]))
  })

  it("uses targetAgentNameSnapshot without adding legacy targetNicknameSnapshot during sub-session execution", async () => {
    const { dependencies } = makeMemoryDependencies()
    const runner = new SubSessionRunner(dependencies)
    let progress: { speaker?: { agentNameSnapshot?: string; nicknameSnapshot?: string } } | undefined

    const result = await runner.runSubSession(
      runInput("agent-name-priority", {
        command: {
          ...command("agent-name-priority"),
          targetAgentNameSnapshot: "새 연구자",
        },
      }),
      async (input, controls) => {
        expect(input.command.targetAgentNameSnapshot).toBe("새 연구자")
        expect(input.command).not.toHaveProperty("targetNicknameSnapshot")
        progress = await controls.emitProgress("agent name progress")
        return createTextResultReport({ command: input.command, text: "named result" })
      },
    )

    expect(result.status).toBe("completed")
    expect(result.subSession.agentName).toBe("새 연구자")
    expect(result.subSession.agentNameSnapshot).toBe("새 연구자")
    expect(result.subSession).not.toHaveProperty("agentNickname")
    expect(progress?.speaker).toMatchObject({ agentNameSnapshot: "새 연구자" })
    expect(progress?.speaker).not.toHaveProperty("nicknameSnapshot")
  })

  it("fills missing command targetAgentNameSnapshot from the runtime agent snapshot", async () => {
    const { dependencies } = makeMemoryDependencies()
    const runner = new SubSessionRunner(dependencies)

    const result = await runner.runSubSession(
      runInput("agent-name-fill", {
        agent: {
          agentId: "agent:researcher",
          agentName: "현장 연구자",
          displayName: "Researcher",
          nickname: "legacy-res",
        },
      }),
      async (input) => {
        expect(input.command.targetAgentNameSnapshot).toBe("현장 연구자")
        expect(input.command).not.toHaveProperty("targetNicknameSnapshot")
        return createTextResultReport({ command: input.command, text: "filled result" })
      },
    )

    expect(result.status).toBe("completed")
    expect(result.subSession.agentName).toBe("현장 연구자")
    expect(result.subSession.agentNameSnapshot).toBe("현장 연구자")
    expect(result.subSession).not.toHaveProperty("agentNickname")
  })

  it("does not infer runtime agent names from legacy displayName or nickname fields", async () => {
    const { dependencies } = makeMemoryDependencies()
    const runner = new SubSessionRunner(dependencies)
    let progress: { speaker?: { agentNameSnapshot?: string; nicknameSnapshot?: string } } | undefined

    const result = await runner.runSubSession(
      runInput("legacy-name-only", {
        agent: {
          agentId: "agent:researcher",
          displayName: "Legacy Display",
          nickname: "Legacy Nick",
        },
      }),
      async (input, controls) => {
        expect(input.command.targetAgentNameSnapshot).toBeUndefined()
        progress = await controls.emitProgress("legacy-only progress")
        return createTextResultReport({ command: input.command, text: "legacy-only result" })
      },
    )

    expect(result.status).toBe("completed")
    expect(result.subSession.agentName).toBe("Unnamed sub-agent")
    expect(result.subSession.agentNameSnapshot).toBeUndefined()
    expect(result.subSession).not.toHaveProperty("agentDisplayName")
    expect(progress?.speaker).toBeUndefined()
    expect(JSON.stringify(result.subSession)).not.toContain("Legacy Display")
    expect(JSON.stringify(result.subSession)).not.toContain("Legacy Nick")
  })

  it("does not infer parent agent names from legacy displayName or nickname fields", () => {
    const contract = buildSubSessionContract(
      runInput("legacy-parent-name-only", {
        agent: {
          agentId: "agent:researcher",
          displayName: "Legacy Display",
          nickname: "Legacy Nick",
        },
        parentAgent: {
          agentId: "agent:parent",
          displayName: "Legacy Parent Display",
          nickname: "Legacy Parent Nick",
        },
      }),
    )

    expect(contract.agentNameSnapshot).toBeUndefined()
    expect(contract.agentName).toBe("Unnamed sub-agent")
    expect(contract).not.toHaveProperty("agentDisplayName")
    expect(contract.parentAgentNameSnapshot).toBeUndefined()
    expect(contract.parentAgentName).toBeUndefined()
    expect(contract.parentAgentDisplayName).toBeUndefined()
    expect(JSON.stringify(contract)).not.toContain("Legacy Display")
    expect(JSON.stringify(contract)).not.toContain("Legacy Nick")
    expect(JSON.stringify(contract)).not.toContain("Legacy Parent Display")
    expect(JSON.stringify(contract)).not.toContain("Legacy Parent Nick")
  })

  it("does not expose legacy displayName or agentId in progress summaries", () => {
    const legacyProgressItem = {
      parentRunId: "run-parent",
      subSessionId: "sub:legacy-progress",
      agentId: "agent:internal-id",
      agentDisplayName: "Legacy Progress Display",
      status: "running",
      summary: "collecting evidence",
      at: now,
    } as unknown as SubSessionProgressAggregationItem
    const summary = buildSubSessionProgressSummary([legacyProgressItem])

    expect(summary).toContain("Unnamed sub-agent running: collecting evidence")
    expect(summary).not.toContain("Legacy Progress Display")
    expect(summary).not.toContain("agent:internal-id")
  })

  it("creates handoff data exchanges with agent-name snapshot fields", () => {
    const source = readFileSync(
      "packages/core/src/orchestration/sub-session-runner.ts",
      "utf8",
    )

    expect(source).toContain("sourceAgentNameSnapshot")
    expect(source).toContain("recipientAgentNameSnapshot")
    expect(source).not.toContain("sourceNicknameSnapshot: input.input.parentAgent")
    expect(source).not.toContain("recipientNicknameSnapshot: input.input.agent")
  })

  it("runs independent sub-sessions in parallel groups", async () => {
    let active = 0
    let maxActive = 0
    const delay = () => new Promise((resolve) => setTimeout(resolve, 10))

    const result = await runParallelSubSessionGroup(
      { groupId: "group:parallel", dependencyEdges: [], concurrencyLimit: 2 },
      ["a", "b"].map((taskId) => ({
        taskId,
        subSessionId: `sub:${taskId}`,
        run: async () => {
          active += 1
          maxActive = Math.max(maxActive, active)
          await delay()
          active -= 1
          return outcome(taskId)
        },
      })),
    )

    expect(result.status).toBe("completed")
    expect(result.waves).toHaveLength(1)
    expect(maxActive).toBe(2)
  })

  it("serializes dependent sub-sessions until predecessor completion", async () => {
    const order: string[] = []
    const result = await runParallelSubSessionGroup(
      {
        groupId: "group:dependency",
        dependencyEdges: [{ fromTaskId: "collect", toTaskId: "summarize", reasonCode: "needs_evidence_first" }],
        concurrencyLimit: 2,
      },
      ["collect", "summarize"].map((taskId) => ({
        taskId,
        subSessionId: `sub:${taskId}`,
        run: () => {
          order.push(taskId)
          return outcome(taskId)
        },
      })),
    )

    expect(result.waves.map((wave) => wave.taskIds)).toEqual([["collect"], ["summarize"]])
    expect(order).toEqual(["collect", "summarize"])
    expect(result.status).toBe("completed")
  })

  it("converts resource lock conflicts into sequential waves", () => {
    const waves = planSubSessionExecutionWaves([
      {
        taskId: "left",
        subSessionId: "sub:left",
        resourceLocks: [exclusiveFileLock("lock:left")],
        run: () => outcome("left"),
      },
      {
        taskId: "right",
        subSessionId: "sub:right",
        resourceLocks: [exclusiveFileLock("lock:right")],
        run: () => outcome("right"),
      },
    ], { dependencyEdges: [], concurrencyLimit: 2 })

    expect(waves.map((wave) => wave.items.map((item) => item.taskId))).toEqual([["left"], ["right"]])
  })

  it("detects resource lock conflicts without semantic matching", () => {
    const manager = new ResourceLockManager()
    expect(manager.acquire("a", [exclusiveFileLock("lock:a")]).ok).toBe(true)
    expect(manager.canAcquire([exclusiveFileLock("lock:b")])).toMatchObject({ ok: false })
    manager.release("a")
    expect(manager.canAcquire([exclusiveFileLock("lock:b")])).toMatchObject({ ok: true })
  })

  it("records resource lock wait latency when a later wave waits on an exclusive lock", async () => {
    let time = now

    const result = await runParallelSubSessionGroup(
      { groupId: "group:resource-wait", dependencyEdges: [], concurrencyLimit: 2 },
      [
        {
          taskId: "left",
          subSessionId: "sub:left",
          resourceLocks: [exclusiveFileLock("lock:left")],
          run: async () => {
            time += 400
            return outcome("left")
          },
        },
        {
          taskId: "right",
          subSessionId: "sub:right",
          resourceLocks: [exclusiveFileLock("lock:right")],
          run: async () => {
            time += 100
            return outcome("right")
          },
        },
      ],
      {
        now: () => time,
        runId: "run-parent",
        sessionId: "session-parent",
        source: "test",
        appendParentEvent: async () => undefined,
      },
    )

    expect(result.status).toBe("completed")
    expect(listLatencyMetrics()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "resource_lock_wait_ms",
        durationMs: 400,
        runId: "run-parent",
        sessionId: "session-parent",
        detail: expect.objectContaining({
          groupId: "group:resource-wait",
          taskId: "right",
          subSessionId: "sub:right",
          waveIndex: 1,
        }),
      }),
    ]))
  })

  it("records immediate wait summaries when later waves are deferred by concurrency and resource locks", async () => {
    const events: string[] = []

    const result = await runParallelSubSessionGroup(
      { groupId: "group:wait-summary", dependencyEdges: [], concurrencyLimit: 2 },
      [
        {
          taskId: "left",
          subSessionId: "sub:left",
          resourceLocks: [exclusiveFileLock("lock:left")],
          run: async () => outcome("left"),
        },
        {
          taskId: "right",
          subSessionId: "sub:right",
          resourceLocks: [exclusiveFileLock("lock:right")],
          run: async () => outcome("right"),
        },
        {
          taskId: "middle",
          subSessionId: "sub:middle",
          run: async () => outcome("middle"),
        },
        {
          taskId: "tail",
          subSessionId: "sub:tail",
          run: async () => outcome("tail"),
        },
      ],
      {
        runId: "run-parent",
        appendParentEvent: async (_runId, label) => {
          events.push(label)
        },
      },
    )

    expect(result.status).toBe("completed")
    expect(events).toContain("sub_session_waiting:group:wait-summary:right(resource_lock), tail(concurrency_limit)")
  })

  it("does not deliver sub-session results directly to the user", async () => {
    const delivery = vi.fn()
    const { dependencies } = makeMemoryDependencies()
    const runner = new SubSessionRunner({ ...dependencies, deliverResultToUser: delivery })

    const result = await runner.runSubSession(runInput("direct-delivery-block"), async (input) =>
      createTextResultReport({ command: input.command, text: "review only" }))

    expect(result.status).toBe("completed")
    expect(delivery).not.toHaveBeenCalled()
  })

  it("replays completed idempotent sub-sessions without duplicate execution", async () => {
    const handler = vi.fn(async (input: RunSubSessionInput) =>
      createTextResultReport({ command: input.command, text: "once" }))
    const { dependencies } = makeMemoryDependencies()
    const runner = new SubSessionRunner(dependencies)

    const first = await runner.runSubSession(runInput("idem"), handler)
    const second = await runner.runSubSession(runInput("idem"), handler)

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.status).toBe("completed")
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("propagates parent cancellation into running sub-sessions", async () => {
    const { dependencies } = makeMemoryDependencies()
    const runner = new SubSessionRunner(dependencies)
    let started: (() => void) | undefined
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })

    const running = runner.runSubSession(runInput("cancel"), async (_input, controls) => {
      started?.()
      await new Promise((_resolve, reject) => {
        controls.signal.addEventListener("abort", () => {
          const error = new Error("aborted")
          error.name = "AbortError"
          reject(error)
        }, { once: true })
      })
      return createTextResultReport({ command: command("cancel"), text: "unreachable" })
    })

    await startedPromise
    expect(runner.cancelParentRun("run-parent")).toBe(1)
    await expect(running).resolves.toMatchObject({ status: "cancelled" })
  })

  it("marks interrupted active sub-sessions as degraded on restart recovery", async () => {
    const updated: SubSessionContract[] = []
    const events: string[] = []
    const active = outcome("active", "running").subSession
    const completed = outcome("done", "completed").subSession

    const result = await recoverInterruptedSubSessions({
      subSessions: [active, completed],
      updateSubSession: (subSession) => {
        updated.push(subSession)
      },
      appendParentEvent: (_runId, label) => {
        events.push(label)
      },
      now: () => now,
    })

    expect(result.decisions).toEqual([
      expect.objectContaining({ subSessionId: "sub:active", action: "mark_failed", nextStatus: "failed" }),
      expect.objectContaining({ subSessionId: "sub:done", action: "unchanged", nextStatus: "completed" }),
    ])
    expect(updated).toHaveLength(1)
    expect(updated[0]?.status).toBe("failed")
    expect(events).toEqual(["sub_session_recovered_degraded:sub:active"])
  })
})
