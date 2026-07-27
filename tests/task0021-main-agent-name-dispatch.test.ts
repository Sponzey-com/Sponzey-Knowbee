import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  getDb,
  upsertAgentConfig,
  upsertAgentRelationship,
  upsertSkillCatalogEntry,
} from "../packages/core/src/db/index.js"
import {
  CONTRACT_SCHEMA_VERSION,
  type AgentRelationship,
  type LlmDiagnosisProvider,
  type LlmDiagnosisSchemaRepairProvider,
  type LlmRequestDiagnosisRecord,
  type LlmResultDiagnosisRecord,
  type MemoryPolicy,
  type ModelProfile,
  type OrchestrationPlan,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type SubAgentConfig,
} from "../packages/core/src/index.ts"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import { clearAgentCapabilityIndexCache } from "../packages/core/src/orchestration/registry.ts"
import { dispatchDelegatedSubAgentTasks } from "../packages/core/src/runs/orchestration-dispatch.ts"
import type { StartRootRunParams } from "../packages/core/src/runs/start.ts"
import { createRootRun, updateRunStatus } from "../packages/core/src/runs/store.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>
let now = Date.UTC(2026, 6, 4, 0, 0, 0)

const requestDiagnosis: LlmRequestDiagnosisRecord = {
  diagnosis_summary: "The request should be delegated after planning.",
  intent: "implementation_request",
  goal: "Implement the delegated scope.",
  constraints: ["Stay within the delegated scope."],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "delegate",
  reason: "A configured sub-agent can handle this scope.",
}

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result is sufficient for parent aggregation.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The child result satisfies the expected output.",
}

class DualDiagnosisProvider implements LlmDiagnosisProvider, LlmDiagnosisSchemaRepairProvider {
  requestCalls: unknown[] = []
  resultCalls: unknown[] = []

  async diagnoseRequest(input: unknown): Promise<unknown> {
    this.requestCalls.push(input)
    return requestDiagnosis
  }

  async diagnoseResult(input: unknown): Promise<unknown> {
    this.resultCalls.push(input)
    return resultDiagnosis
  }

  async repairDiagnosis(input: unknown): Promise<unknown> {
    return input
  }
}

function useTempState(): void {
  closeDb()
  clearAgentCapabilityIndexCache()
  now = Date.UTC(2026, 6, 4, 0, 0, 0)
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0021-main-agent-name-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function owner(ownerId: string): RuntimeIdentity["owner"] {
  return { ownerType: "sub_agent", ownerId }
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

function modelProfile(): ModelProfile {
  return {
    providerId: "openai",
    modelId: "gpt-5.4",
    timeoutMs: 30_000,
    retryCount: 2,
    costBudget: 5,
  }
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: owner(agentId),
    visibility: "private",
    readScopes: [owner(agentId)],
    writeScope: owner(agentId),
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

function allowlist(agentId: string): SkillMcpAllowlist {
  return {
    enabledSkillIds: ["skill:research"],
    enabledMcpServerIds: [],
    enabledToolNames: [],
    disabledToolNames: [],
    secretScopeId: `scope:${agentId}`,
  }
}

function subAgent(agentId: string, overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: agentId.replace("agent:", ""),
    displayName: agentId.replace("agent:", ""),
    nickname: agentId.replace("agent:", ""),
    status: "enabled",
    role: "work record snapshot test worker",
    personality: "Precise",
    specialtyTags: ["research"],
    avoidTasks: [],
    modelProfile: modelProfile(),
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist(agentId),
      rateLimit: { maxConcurrentCalls: 2 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 2,
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 2,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function relationship(parentAgentId: string, childAgentId: string): AgentRelationship {
  return {
    edgeId: `relationship:${parentAgentId}->${childAgentId}`,
    parentAgentId,
    childAgentId,
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  }
}

function createDispatchPlan(parentRunId: string): OrchestrationPlan {
  return {
    identity: {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      entityType: "session",
      entityId: `plan:${parentRunId}`,
      owner: { ownerType: "knowbee", ownerId: "agent:knowbee" },
      idempotencyKey: `plan:${parentRunId}`,
      parent: {
        parentRunId,
        parentSessionId: `session:${parentRunId}`,
        parentRequestId: `request:${parentRunId}`,
      },
    },
    planId: `plan:${parentRunId}`,
    parentRunId,
    parentRequestId: `request:${parentRunId}`,
    directKnowbeeTasks: [],
    delegatedTasks: [
      {
        taskId: "task:implement",
        executionKind: "delegated_sub_agent",
        scope: {
          goal: "투자 봇 구현 범위를 맡아 실제 파일 작업을 수행한다.",
          intentType: "execute_now",
          actionType: "implement_code",
          constraints: ["부모 요청 범위 안에서 처리한다."],
          expectedOutputs: [
            {
              outputId: "implementation_summary",
              kind: "text",
              description: "구현 결과 요약",
              required: true,
              acceptance: {
                requiredEvidenceKinds: ["child_run"],
                artifactRequired: false,
                reasonCodes: ["child_run_completed"],
              },
            },
          ],
          reasonCodes: ["delegation_required"],
        },
        assignedAgentId: "agent:alpha",
        requiredCapabilities: ["research"],
        resourceLockIds: [],
      },
    ],
    dependencyEdges: [],
    resourceLocks: [],
    parallelGroups: [],
    approvalRequirements: [],
    fallbackStrategy: {
      mode: "single_knowbee",
      reasonCode: "delegation_planned",
    },
    createdAt: now,
  }
}

function seedDispatchParent(parentRunId: string): void {
  upsertSkillCatalogEntry(
    {
      skillId: "skill:research",
      displayName: "Research",
      risk: "safe",
      toolNames: ["web_search"],
    },
    { now },
  )
  upsertAgentConfig(subAgent("agent:alpha", {
    agentName: "현장 담당",
    displayName: "Legacy Alpha Display",
    nickname: "Legacy Alpha Nick",
  }), { source: "manual", now })
  upsertAgentRelationship(relationship("agent:knowbee", "agent:alpha"), { now })
  getDb()
    .prepare(
      `INSERT INTO sessions (id, source, source_id, created_at, updated_at, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`session:${parentRunId}`, "webui", "test", now, now, "work record snapshot test")
  createRootRun({
    id: parentRunId,
    sessionId: `session:${parentRunId}`,
    requestGroupId: `request-group:${parentRunId}`,
    prompt: "투자 봇을 구현해줘.",
    source: "webui",
    orchestrationMode: "orchestration",
  })
}

async function dispatchForSnapshot(input: {
  parentRunId: string
  parentAgentName: string
  diagnosisProvider?: LlmDiagnosisProvider
  diagnosisRepairProvider?: LlmDiagnosisSchemaRepairProvider
}) {
  const childRunParams: StartRootRunParams[] = []
  const result = await dispatchDelegatedSubAgentTasks({
    plan: createDispatchPlan(input.parentRunId),
    parentRunId: input.parentRunId,
    parentAgentName: input.parentAgentName,
    parentSessionId: `session:${input.parentRunId}`,
    parentRequestGroupId: `request-group:${input.parentRunId}`,
    source: "webui",
    message: "투자 봇을 구현해줘.",
    workDir: process.cwd(),
    controller: new AbortController(),
  }, {
    config: runtimeFixture.config,
    startSubAgentRun: (params: StartRootRunParams) => {
      childRunParams.push(params)
      const child = createRootRun({
        id: `run:child:${input.parentRunId}`,
        sessionId: params.sessionId ?? `session:${input.parentRunId}`,
        ...(params.requestGroupId ? { requestGroupId: params.requestGroupId } : {}),
        ...(params.lineageRootRunId ? { lineageRootRunId: params.lineageRootRunId } : {}),
        ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
        runScope: "child",
        prompt: params.message,
        source: params.source,
        ...(params.taskProfile ? { taskProfile: params.taskProfile } : {}),
        ...(params.targetId ? { targetId: params.targetId } : {}),
        ...(params.targetLabel ? { targetLabel: params.targetLabel } : {}),
        contextMode: "handoff",
      })
      const completed = updateRunStatus(child.id, "completed", "alpha completed", false)
      return {
        runId: child.id,
        sessionId: child.sessionId,
        status: "started",
        finished: Promise.resolve(completed ?? child),
      }
    },
    now: () => now,
    ...(input.diagnosisProvider ? { diagnosisProvider: input.diagnosisProvider } : {}),
    ...(input.diagnosisRepairProvider ? { diagnosisRepairProvider: input.diagnosisRepairProvider } : {}),
  })
  return { result, childRunParams }
}

function snapshotPayloads(parentRunId: string): Array<Record<string, unknown>> {
  return listOrchestrationEventLedger({
    runId: parentRunId,
    eventKind: "work_record_snapshot",
  }).map((event) => event.payload)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  clearAgentCapabilityIndexCache()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0021 main agent name propagation for dispatch", () => {
  it("uses the provided parent agent name for request diagnosis and handoff snapshots", async () => {
    seedDispatchParent("run:parent:main-agent-name")
    const provider = new DualDiagnosisProvider()

    const { result, childRunParams } = await dispatchForSnapshot({
      parentRunId: "run:parent:main-agent-name",
      parentAgentName: "마당쇠",
      diagnosisProvider: provider,
      diagnosisRepairProvider: provider,
    })
    const snapshots = snapshotPayloads("run:parent:main-agent-name")

    expect(result).toMatchObject({ attempted: 1, completed: 1, failed: 0, skipped: 0 })
    expect(childRunParams[0]?.targetLabel).toBe("현장 담당")
    expect(childRunParams[0]?.config).toBe(runtimeFixture.config)
    expect(provider.requestCalls).toHaveLength(1)
    expect(provider.requestCalls[0]).toMatchObject({ ownerAgentName: "마당쇠" })
    expect(provider.resultCalls).toHaveLength(1)
    expect(snapshots).toHaveLength(2)
    expect(snapshots).toEqual(expect.arrayContaining([
      expect.objectContaining({
        snapshotKind: "work_handoff_package",
        stage: "pre_dispatch_handoff",
        workId: expect.stringContaining("work:"),
        validationStatus: "valid",
        record: expect.objectContaining({
          parent_agent_name: "마당쇠",
          target_agent_name: "현장 담당",
          request_diagnosis: expect.objectContaining({ recommended_action: "delegate" }),
        }),
      }),
      expect.objectContaining({
        snapshotKind: "child_work_result",
        stage: "post_review_child_result",
        workId: expect.stringContaining("work:"),
        validationStatus: "valid",
        record: expect.objectContaining({
          agent_name: "현장 담당",
          result_diagnosis: expect.objectContaining({ recommended_action: "final_report" }),
          action_decision: expect.objectContaining({ selected_action: "final_report" }),
        }),
      }),
    ]))
    const serializedSnapshots = JSON.stringify(snapshots)
    expect(serializedSnapshots).not.toContain("Legacy Alpha Display")
    expect(serializedSnapshots).not.toContain("Legacy Alpha Nick")
  })
})
