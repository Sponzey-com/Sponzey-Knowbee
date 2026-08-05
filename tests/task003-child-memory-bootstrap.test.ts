import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
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
import {
  closeDb,
  getAgentMemoryStateByScopeKey,
  getAgentDataExchange,
  insertMemoryCapsule,
  insertSession,
} from "../packages/core/src/db/index.js"
import {
  buildAgentMemoryStateScopeKey,
  buildSubAgentMemoryStateScope,
} from "../packages/core/src/memory/agent-state.ts"
import {
  SubSessionRunner,
  createTextResultReport,
  type RunSubSessionInput,
  type SubSessionRuntimeDependencies,
} from "../packages/core/src/orchestration/sub-session-runner.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 4, 18, 9, 0, 0)

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
  disabledToolNames: [],
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

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task003-bootstrap-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

function identity(entityType: RuntimeIdentity["entityType"], entityId: string): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType,
    entityId,
    owner: { ownerType: "sub_agent", ownerId: "agent:researcher" },
    idempotencyKey: `idem:${entityId}`,
    auditCorrelationId: `audit:${entityId}`,
    parent: {
      parentRunId: "run-parent",
      parentRequestId: "request-parent",
    },
  }
}

function promptBundle(): AgentPromptBundle {
  return {
    identity: identity("sub_session", "bundle:researcher"),
    bundleId: "bundle:researcher",
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
    taskScope,
    safetyRules: ["Do not deliver results directly to the user."],
    sourceProvenance: [{ sourceId: "profile:agent:researcher", version: "1" }],
    renderedPrompt: "부모 전체 transcript 원문은 bootstrap에 들어가면 안 된다.",
    createdAt: now,
  }
}

function command(): CommandRequest {
  return {
    identity: identity("sub_session", "sub:child"),
    commandRequestId: "command:child",
    parentRunId: "run-parent",
    subSessionId: "sub:child",
    targetAgentId: "agent:researcher",
    targetAgentNameSnapshot: "Researcher",
    taskScope,
    contextPackageIds: ["exchange:ctx-1", "exchange:ctx-2"],
    expectedOutputs: [expectedOutput],
  }
}

function runInput(): RunSubSessionInput {
  return {
    command: command(),
    agent: {
      agentId: "agent:researcher",
      displayName: "Researcher",
      nickname: "Researcher",
    },
    parentSessionId: "session-parent",
    promptBundle: promptBundle(),
  }
}

function makeDependencies() {
  const sessions = new Map<string, SubSessionContract>()
  let time = now
  const clone = <T>(value: T): T => structuredClone(value)
  const dependencies: SubSessionRuntimeDependencies = {
    now: () => {
      time += 1
      return time
    },
    idProvider: () => `id-${time += 1}`,
    loadSubSessionByIdempotencyKey: (idempotencyKey) =>
      clone([...sessions.values()].find((session) => session.identity.idempotencyKey === idempotencyKey)),
    persistSubSession: (subSession) => {
      sessions.set(subSession.subSessionId, clone(subSession))
      return true
    },
    updateSubSession: (subSession) => {
      sessions.set(subSession.subSessionId, clone(subSession))
    },
    appendParentEvent: () => {},
  }
  return { dependencies, sessions }
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

describe("task003 child own memory bootstrap", () => {
  it("starts child runs with handoff-only bootstrap and without parent raw transcript merge", async () => {
    insertSession({
      id: "session-parent",
      source: "slack",
      source_id: "slack:C123:thread-1",
      created_at: 1,
      updated_at: 1,
      summary: null,
    })
    const previousScope = buildSubAgentMemoryStateScope({
      agentId: "agent:researcher",
      sessionId: "session-parent",
      requestGroupId: "command:previous",
      lineageId: "sub:previous",
      channelKey: "slack",
      threadKey: "slack:C123:thread-1",
    })
    insertMemoryCapsule({
      capsuleId: "capsule:previous",
      capsuleVersion: 1,
      ownerScope: previousScope,
      nicknameSnapshot: "Researcher",
      capsuleKind: "handoff_compaction",
      summary: "이전 child 결과 요약",
      activeObjectives: ["이전 objective"],
      confirmedFacts: ["이전 fact"],
      decisions: ["이전 decision"],
      constraints: ["이전 constraint"],
      pendingItems: ["pending_approval:review-1"],
      artifactRefs: [],
      recoveryHints: ["이전 continuity"],
      sourceRefs: ["exchange:previous"],
      compactedMessageIds: [],
      sourceTokenEstimate: 120,
      resultTokenEstimate: 48,
      createdAt: now - 1_000,
    })
    insertMemoryCapsule({
      capsuleId: "capsule:foreign-newer",
      capsuleVersion: 1,
      ownerScope: buildSubAgentMemoryStateScope({
        agentId: "agent:other",
        sessionId: "session-parent",
        requestGroupId: "command:foreign",
        lineageId: "sub:foreign",
        channelKey: "slack",
        threadKey: "slack:C123:thread-1",
      }),
      agentNameSnapshot: "Other",
      capsuleKind: "handoff_compaction",
      summary: "다른 실행자의 비공개 메모리",
      activeObjectives: ["foreign objective"],
      confirmedFacts: ["foreign fact"],
      decisions: [],
      constraints: [],
      pendingItems: [],
      artifactRefs: [],
      recoveryHints: [],
      sourceRefs: ["exchange:foreign"],
      compactedMessageIds: [],
      sourceTokenEstimate: 100,
      resultTokenEstimate: 30,
      createdAt: now,
    })

    const { dependencies } = makeDependencies()
    const runner = new SubSessionRunner(dependencies)
    const outcome = await runner.runSubSession(runInput(), async (input) =>
      createTextResultReport(input.command, "작업 결과"),
    )

    const bootstrap = outcome.subSession.memoryBootstrap
    const expectedScope = buildSubAgentMemoryStateScope({
      agentId: "agent:researcher",
      sessionId: "session-parent",
      requestGroupId: "command:child",
      lineageId: "sub:child",
      channelKey: "slack",
      threadKey: "slack:C123:thread-1",
    })

    expect(bootstrap).toEqual(expect.objectContaining({
      ownerScope: expectedScope,
      agentNameSnapshot: "Researcher",
      seedMode: "child_own_state",
      rawTranscriptIncluded: false,
      latestCapsuleId: "capsule:previous",
      handoffExchangeId: "exchange:handoff:command:child",
      additionalContextRefs: [
        "exchange:ctx-1",
        "exchange:ctx-2",
        "exchange:handoff:command:child",
      ],
    }))
    expect(bootstrap).not.toHaveProperty("nicknameSnapshot")
    expect(bootstrap?.initialPinnedItems).toEqual(expect.arrayContaining([
      "goal:Collect a small result for parent review.",
      "constraint:Do not deliver directly to the user.",
      "expected_output:answer",
      "handoff_summary:이전 child 결과 요약",
    ]))
    expect(bootstrap?.sourceProvenanceRefs).toEqual(expect.arrayContaining([
      "exchange:ctx-1",
      "exchange:ctx-2",
      "exchange:handoff:command:child",
      "command_request:command:child",
    ]))
    expect(JSON.stringify(bootstrap)).not.toContain("부모 전체 transcript")
    expect(JSON.stringify(bootstrap)).not.toContain("다른 실행자의 비공개 메모리")

    const state = getAgentMemoryStateByScopeKey(buildAgentMemoryStateScopeKey(expectedScope))
    expect(state).toEqual(expect.objectContaining({
      ownerScope: expectedScope,
      latestCapsuleId: "capsule:previous",
      agentNameSnapshot: "Researcher",
    }))
    expect(state).not.toHaveProperty("nicknameSnapshot")
    const handoffExchange = getAgentDataExchange("exchange:handoff:command:child")
    expect(handoffExchange?.allowed_use).toBe("temporary_context")
    expect(JSON.parse(handoffExchange?.payload_json ?? "{}")).toMatchObject({
      kind: "sub_session_handoff_capsule",
      currentGoal: "Collect a small result for parent review.",
      latestSafeContextSummary: "이전 child 결과 요약",
      targetContext: {
        targetAgentId: "agent:researcher",
        commandRequestId: "command:child",
      },
    })
  })
})
