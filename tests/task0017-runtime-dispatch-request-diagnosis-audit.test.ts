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

const validRequestDiagnosis: LlmRequestDiagnosisRecord = {
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

const validResultDiagnosis: LlmResultDiagnosisRecord = {
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

class FakeDiagnosisProvider implements LlmDiagnosisProvider {
  requestCalls: unknown[] = []
  resultCalls: unknown[] = []

  constructor(private readonly requestOutput: unknown) {}

  async diagnoseRequest(input: unknown): Promise<unknown> {
    this.requestCalls.push(input)
    return this.requestOutput
  }

  async diagnoseResult(input: unknown): Promise<unknown> {
    this.resultCalls.push(input)
    return validResultDiagnosis
  }
}

class FakeRepairProvider implements LlmDiagnosisSchemaRepairProvider {
  calls: unknown[] = []

  constructor(private readonly output: unknown) {}

  async repairDiagnosis(input: unknown): Promise<unknown> {
    this.calls.push(input)
    return this.output
  }
}

function useTempState(): void {
  closeDb()
  clearAgentCapabilityIndexCache()
  now = Date.UTC(2026, 6, 4, 0, 0, 0)
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0017-dispatch-diagnosis-"))
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

function allowlist(agentId: string, overrides: Partial<SkillMcpAllowlist> = {}): SkillMcpAllowlist {
  return {
    enabledSkillIds: ["skill:research"],
    enabledMcpServerIds: [],
    enabledToolNames: [],
    disabledToolNames: [],
    secretScopeId: `scope:${agentId}`,
    ...overrides,
  }
}

function subAgent(agentId: string, overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    displayName: agentId.replace("agent:", ""),
    nickname: agentId.replace("agent:", ""),
    status: "enabled",
    role: "diagnosis audit test worker",
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
  upsertAgentConfig(subAgent("agent:alpha"), { source: "manual", now })
  upsertAgentRelationship(relationship("agent:knowbee", "agent:alpha"), { now })
  getDb()
    .prepare(
      `INSERT INTO sessions (id, source, source_id, created_at, updated_at, summary)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(`session:${parentRunId}`, "webui", "test", now, now, "dispatch diagnosis audit test")
  createRootRun({
    id: parentRunId,
    sessionId: `session:${parentRunId}`,
    requestGroupId: `request-group:${parentRunId}`,
    prompt: "투자 봇을 구현해줘.",
    source: "webui",
    orchestrationMode: "orchestration",
  })
}

async function dispatchForAudit(input: {
  parentRunId: string
  diagnosisProvider?: LlmDiagnosisProvider
  diagnosisRepairProvider?: LlmDiagnosisSchemaRepairProvider
}) {
  const childRunParams: StartRootRunParams[] = []
  const result = await dispatchDelegatedSubAgentTasks({
    plan: createDispatchPlan(input.parentRunId),
    parentRunId: input.parentRunId,
    parentAgentName: "Knowbee",
    parentSessionId: `session:${input.parentRunId}`,
    parentRequestGroupId: `request-group:${input.parentRunId}`,
    source: "webui",
    message: "투자 봇을 구현해줘.",
    workDir: process.cwd(),
    controller: new AbortController(),
  }, {
    config: runtimeFixture.config,
    startSubAgentRun: (params) => {
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

function preDispatchAuditPayload(parentRunId: string): Record<string, unknown> {
  const event = listOrchestrationEventLedger({
    runId: parentRunId,
    eventKind: "structured_work_audit",
  }).find((item) => item.payload.stage === "pre_dispatch_handoff")
  if (!event) throw new Error(`pre-dispatch audit event not found for ${parentRunId}`)
  return event.payload
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

describe("task0017 runtime dispatch request diagnosis audit", () => {
  it("blocks dispatch and records missing diagnosis when no provider is injected", async () => {
    seedDispatchParent("run:parent:missing")

    const { result, childRunParams } = await dispatchForAudit({ parentRunId: "run:parent:missing" })
    const payload = preDispatchAuditPayload("run:parent:missing")

    expect(result).toMatchObject({ attempted: 1, completed: 0, failed: 1, skipped: 0 })
    expect(result.outcomes[0]).toMatchObject({
      status: "failed",
      reasonCode: "request_diagnosis_required",
    })
    expect(childRunParams).toHaveLength(0)
    expect(payload).toMatchObject({
      stage: "pre_dispatch_handoff",
      status: "skipped",
      reasonCode: "missing_runtime_diagnosis",
    })
  })

  it("uses valid request diagnosis for the pre-dispatch handoff audit when providers are injected", async () => {
    seedDispatchParent("run:parent:valid")
    const provider = new FakeDiagnosisProvider(validRequestDiagnosis)
    const repairProvider = new FakeRepairProvider(validRequestDiagnosis)

    const { result } = await dispatchForAudit({
      parentRunId: "run:parent:valid",
      diagnosisProvider: provider,
      diagnosisRepairProvider: repairProvider,
    })
    const payload = preDispatchAuditPayload("run:parent:valid")

    expect(result).toMatchObject({ attempted: 1, completed: 1, failed: 0, skipped: 0 })
    expect(provider.requestCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(0)
    expect(payload).toMatchObject({
      stage: "pre_dispatch_handoff",
      status: "valid",
      reasonCode: null,
    })
  })

  it("blocks dispatch and avoids action input when diagnosis repair fails", async () => {
    seedDispatchParent("run:parent:invalid")
    const invalidDiagnosis = { ...validRequestDiagnosis, recommended_action: "bad_action" }
    const provider = new FakeDiagnosisProvider(invalidDiagnosis)
    const repairProvider = new FakeRepairProvider(invalidDiagnosis)

    const { result, childRunParams } = await dispatchForAudit({
      parentRunId: "run:parent:invalid",
      diagnosisProvider: provider,
      diagnosisRepairProvider: repairProvider,
    })
    const payload = preDispatchAuditPayload("run:parent:invalid")

    expect(result).toMatchObject({ attempted: 1, completed: 0, failed: 1, skipped: 0 })
    expect(result.outcomes[0]).toMatchObject({
      status: "failed",
      reasonCode: "request_diagnosis_required",
    })
    expect(childRunParams).toHaveLength(0)
    expect(provider.requestCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(1)
    expect(payload).toMatchObject({
      stage: "pre_dispatch_handoff",
      status: "skipped",
      reasonCode: "missing_runtime_diagnosis",
    })
  })
})
