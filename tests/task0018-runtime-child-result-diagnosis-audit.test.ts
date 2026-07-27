import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import {
  closeDb,
} from "../packages/core/src/db/index.js"
import { listOrchestrationEventLedger } from "../packages/core/src/orchestration/event-ledger.ts"
import {
  SubSessionRunner,
  createTextResultReport,
  type RunSubSessionInput,
  type SubSessionRuntimeDependencies,
} from "../packages/core/src/orchestration/sub-session-runner.ts"
import type {
  AgentPromptBundle,
  CommandRequest,
  ExpectedOutputContract,
  MemoryPolicy,
  PermissionProfile,
  RuntimeIdentity,
  SkillMcpAllowlist,
  StructuredTaskScope,
  SubSessionContract,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import type {
  LlmDiagnosisProvider,
  LlmDiagnosisSchemaRepairProvider,
  LlmResultDiagnosisRecord,
} from "../packages/core/src/index.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 6, 4, 0, 0, 0)

const resultDiagnosis: LlmResultDiagnosisRecord = {
  diagnosis_summary: "The child result is sufficient for parent aggregation.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The result satisfies the expected output.",
}

class FakeDiagnosisProvider implements LlmDiagnosisProvider {
  resultCalls: unknown[] = []

  constructor(private readonly resultOutput: unknown) {}

  async diagnoseRequest(_input: unknown): Promise<unknown> {
    throw new Error("request diagnosis is not used by child result audit")
  }

  async diagnoseResult(input: unknown): Promise<unknown> {
    this.resultCalls.push(input)
    return this.resultOutput
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

function runInput(id: string): RunSubSessionInput {
  return {
    command: command(id),
    agent: {
      agentId: "agent:researcher",
      displayName: "Researcher",
      nickname: "Res",
    },
    parentSessionId: "session-parent",
    promptBundle: promptBundle(),
  }
}

function makeDependencies(overrides: Partial<SubSessionRuntimeDependencies> = {}): SubSessionRuntimeDependencies {
  const sessions = new Map<string, SubSessionContract>()
  const clone = <T>(value: T): T => structuredClone(value)
  let time = now
  return {
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
    appendParentEvent: () => undefined,
    isParentCancelled: () => false,
    ...overrides,
  }
}

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0018-child-result-diagnosis-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function postReviewAuditPayload(): Record<string, unknown> {
  const event = listOrchestrationEventLedger({
    runId: "run-parent",
    eventKind: "structured_work_audit",
  }).find((item) => item.payload.stage === "post_review_child_result")
  if (!event) throw new Error("post-review child result audit event not found")
  return event.payload
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0018 runtime child result diagnosis audit", () => {
  it("blocks child result integration when no provider is injected", async () => {
    const runner = new SubSessionRunner(makeDependencies())

    const outcome = await runner.runSubSession(runInput("missing"), async (input) =>
      createTextResultReport({ command: input.command, text: "child result" }))
    const payload = postReviewAuditPayload()

    expect(outcome.status).toBe("failed")
    expect(outcome.errorReport).toMatchObject({
      reasonCode: "result_diagnosis_required",
      retryable: true,
    })
    expect(payload).toMatchObject({
      stage: "post_review_child_result",
      status: "skipped",
      reasonCode: "missing_runtime_diagnosis",
    })
  })

  it("uses valid result diagnosis for post-review child result audit when providers are injected", async () => {
    const provider = new FakeDiagnosisProvider(resultDiagnosis)
    const repairProvider = new FakeRepairProvider(resultDiagnosis)
    const runner = new SubSessionRunner(makeDependencies({
      diagnosisProvider: provider,
      diagnosisRepairProvider: repairProvider,
    }))

    const outcome = await runner.runSubSession(runInput("valid"), async (input) =>
      createTextResultReport({ command: input.command, text: "child result" }))
    const payload = postReviewAuditPayload()

    expect(outcome.status).toBe("completed")
    expect(provider.resultCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(0)
    expect(payload).toMatchObject({
      stage: "post_review_child_result",
      status: "valid",
      reasonCode: null,
    })
  })

  it("blocks child result integration and avoids action input when result diagnosis repair fails", async () => {
    const invalidDiagnosis = { ...resultDiagnosis, recommended_action: "bad_action" }
    const provider = new FakeDiagnosisProvider(invalidDiagnosis)
    const repairProvider = new FakeRepairProvider(invalidDiagnosis)
    const runner = new SubSessionRunner(makeDependencies({
      diagnosisProvider: provider,
      diagnosisRepairProvider: repairProvider,
    }))

    const outcome = await runner.runSubSession(runInput("invalid"), async (input) =>
      createTextResultReport({ command: input.command, text: "child result" }))
    const payload = postReviewAuditPayload()

    expect(outcome.status).toBe("failed")
    expect(outcome.errorReport).toMatchObject({
      reasonCode: "result_diagnosis_required",
      retryable: true,
    })
    expect(provider.resultCalls).toHaveLength(1)
    expect(repairProvider.calls).toHaveLength(1)
    expect(payload).toMatchObject({
      stage: "post_review_child_result",
      status: "skipped",
      reasonCode: "missing_runtime_diagnosis",
    })
  })
})
