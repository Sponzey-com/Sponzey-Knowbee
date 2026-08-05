import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  getRunSubSession,
  insertRunSubSession,
  AgentNameNamespaceError,
  upsertAgentConfig,
  upsertTeamConfig,
} from "../packages/core/src/db/index.js"
import {
  CONTRACT_SCHEMA_VERSION,
  createTextResultReport,
  normalizeAgentName,
  normalizeAgentNameSnapshot,
  validateNamedDeliveryEvent,
  validateNamedHandoffEvent,
  validateAgentConfig,
  validateUserVisibleAgentMessage,
  type AgentNameSnapshot,
  type CommandRequest,
  type ExpectedOutputContract,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type StructuredTaskScope,
  type SubAgentConfig,
  type SubSessionContract,
  type TeamConfig,
} from "../packages/core/src/index.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 3, 23, 0, 0, 0)

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task002-nickname-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
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

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

function owner(ownerId = "agent:knowbee"): RuntimeIdentity["owner"] {
  return { ownerType: "knowbee", ownerId }
}

function identity(entityType: RuntimeIdentity["entityType"], entityId: string): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType,
    entityId,
    owner: owner(),
    idempotencyKey: `idempotency:${entityType}:${entityId}`,
    auditCorrelationId: `audit:${entityId}`,
    parent: {
      parentRunId: "run-parent",
      parentRequestId: "request-parent",
    },
  }
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: { ownerType: "sub_agent", ownerId: agentId },
    visibility: "private",
    readScopes: [{ ownerType: "sub_agent", ownerId: agentId }],
    writeScope: { ownerType: "sub_agent", ownerId: agentId },
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function subAgent(input: {
  agentId: string
  agentName: string
  status?: SubAgentConfig["status"]
}): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: input.agentId,
    agentName: input.agentName,
    status: input.status ?? "enabled",
    role: "worker",
    personality: "Precise",
    specialtyTags: ["general"],
    avoidTasks: [],
    memoryPolicy: memoryPolicy(input.agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
  }
}

function team(input: {
  teamId: string
  displayName: string
  memberAgentIds?: string[]
}): TeamConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    teamId: input.teamId,
    displayName: input.displayName,
    status: "enabled",
    purpose: "Planning group",
    memberAgentIds: input.memberAgentIds ?? [],
    roleHints: [],
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
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
  goal: "Collect result",
  intentType: "runtime_test",
  actionType: "sub_session_runtime",
  constraints: ["Do not deliver directly to the user."],
  expectedOutputs: [expectedOutput],
  reasonCodes: ["runtime_test"],
}

function command(targetAgentNameSnapshot = "Researcher"): CommandRequest {
  return {
    identity: identity("sub_session", "command:1"),
    commandRequestId: "command:1",
    parentRunId: "run-parent",
    subSessionId: "sub-session:1",
    targetAgentId: "agent:researcher",
    targetAgentNameSnapshot,
    taskScope,
    contextPackageIds: [],
    expectedOutputs: [expectedOutput],
  }
}

function subSession(agentNameSnapshot = "Researcher"): SubSessionContract {
  return {
    identity: identity("sub_session", "sub-session:1"),
    subSessionId: "sub-session:1",
    parentSessionId: "session-parent",
    parentRunId: "run-parent",
    agentId: "agent:researcher",
    agentName: "Researcher",
    agentDisplayName: "Legacy Researcher display",
    agentNameSnapshot,
    commandRequestId: "command:1",
    status: "queued",
    promptBundleId: "bundle:1",
  }
}

function legacyNicknameSnapshot(entityId: string, nickname: string): Record<string, unknown> {
  return {
    entityType: entityId.startsWith("team:") ? "team" : "sub_agent",
    entityId,
    nicknameSnapshot: nickname,
  }
}

function agentNameSnapshot(entityId: string, agentName: string): AgentNameSnapshot {
  return {
    entityType: entityId.startsWith("team:") ? "team" : "sub_agent",
    entityId,
    agentNameSnapshot: agentName,
  }
}

describe("task002 agent name and user-facing attribution", () => {
  it("normalizes agent names with trim, whitespace collapse, and case folding", () => {
    expect(normalizeAgentName("  Research   Agent  ")).toBe("research agent")
    expect(normalizeAgentName("  노비   리서치  ")).toBe("노비 리서치")
    expect(normalizeAgentNameSnapshot("  Research   Agent  ")).toBe("Research Agent")
    const invalidAgent = validateAgentConfig({
      ...subAgent({ agentId: "agent:missing-name", agentName: "Researcher" }),
      agentName: "",
    })
    expect(invalidAgent.ok).toBe(false)
    if (!invalidAgent.ok) expect(invalidAgent.issues.map((issue) => issue.path)).toContain("$.agentName")
  })

  it("blocks duplicate agent nicknames in the normalized namespace", () => {
    upsertAgentConfig(subAgent({ agentId: "agent:researcher", agentName: "Research Agent" }), { now })

    let error: unknown
    try {
      upsertAgentConfig(subAgent({ agentId: "agent:writer", agentName: " research   agent " }), { now })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(AgentNameNamespaceError)
    expect((error as AgentNameNamespaceError).details).toMatchObject({
      reasonCode: "agent_name_conflict",
      attemptedEntityType: "agent",
      attemptedEntityId: "agent:writer",
      existingEntityType: "agent",
      existingEntityId: "agent:researcher",
      normalizedAgentName: "research agent",
    })
  })

  it("blocks team nicknames that collide with agent nicknames", () => {
    upsertAgentConfig(subAgent({ agentId: "agent:evidence", agentName: "Evidence Team" }), { now })

    expect(() => {
      upsertTeamConfig(team({ teamId: "team:evidence", displayName: " evidence   team " }), { now })
    }).toThrow(AgentNameNamespaceError)
  })

  it("validates user-visible message, handoff, and delivery attribution snapshots", () => {
    const speaker = agentNameSnapshot("agent:researcher", "Researcher")
    const recipient = { entityType: "knowbee" as const, entityId: "agent:knowbee", agentNameSnapshot: "노비" }

    expect(validateUserVisibleAgentMessage({
      identity: identity("sub_session", "message:1"),
      messageId: "message:1",
      parentRunId: "run-parent",
      speaker,
      text: "조사 결과를 요약했습니다.",
      createdAt: now,
    }).ok).toBe(true)

    const invalidMessage = validateUserVisibleAgentMessage({
      identity: identity("sub_session", "message:2"),
      messageId: "message:2",
      parentRunId: "run-parent",
      speaker: { ...speaker, agentNameSnapshot: "", displayName: "Researcher" },
      text: "invalid",
      createdAt: now,
    })
    expect(invalidMessage.ok).toBe(false)
    if (!invalidMessage.ok) {
      expect(invalidMessage.issues.map((issue) => issue.path)).toEqual(expect.arrayContaining([
        "$.speaker.agentNameSnapshot",
        "$.speaker.displayName",
      ]))
    }

    const legacyMessage = validateUserVisibleAgentMessage({
      identity: identity("sub_session", "message:legacy"),
      messageId: "message:legacy",
      parentRunId: "run-parent",
      speaker: legacyNicknameSnapshot("agent:researcher", "Researcher") as unknown as AgentNameSnapshot,
      text: "legacy",
      createdAt: now,
    })
    expect(legacyMessage.ok).toBe(false)
    if (!legacyMessage.ok) {
      expect(legacyMessage.issues.map((issue) => issue.path)).toContain("$.speaker.agentNameSnapshot")
    }

    expect(validateNamedHandoffEvent({
      identity: identity("data_exchange", "handoff:1"),
      handoffId: "handoff:1",
      parentRunId: "run-parent",
      sender: recipient,
      recipient: speaker,
      purpose: "context handoff",
      createdAt: now,
    }).ok).toBe(true)

    const invalidDelivery = validateNamedDeliveryEvent({
      identity: identity("data_exchange", "delivery:1"),
      deliveryId: "delivery:1",
      parentRunId: "run-parent",
      deliveryKind: "data_exchange",
      sender: { ...speaker, agentNameSnapshot: "" },
      recipient,
      summary: "context delivered",
      exchangeId: "exchange:1",
      createdAt: now,
    })
    expect(invalidDelivery.ok).toBe(false)
    if (!invalidDelivery.ok) {
      expect(invalidDelivery.issues.map((issue) => issue.path)).toContain("$.sender.agentNameSnapshot")
    }

    const invalidRecipient = validateNamedDeliveryEvent({
      identity: identity("data_exchange", "delivery:2"),
      deliveryId: "delivery:2",
      parentRunId: "run-parent",
      deliveryKind: "data_exchange",
      sender: speaker,
      recipient: { ...recipient, agentNameSnapshot: "" },
      summary: "context delivered",
      exchangeId: "exchange:2",
      createdAt: now,
    })
    expect(invalidRecipient.ok).toBe(false)
    if (!invalidRecipient.ok) {
      expect(invalidRecipient.issues.map((issue) => issue.path)).toContain("$.recipient.agentNameSnapshot")
    }
  })

  it("keeps result source agent name snapshots for parent final answer synthesis", () => {
    const result = createTextResultReport({
      command: command("  Researcher  "),
      idProvider: () => "result:1",
      text: "evidence summary",
    })

    expect(result.source).toEqual({
      entityType: "sub_agent",
      entityId: "agent:researcher",
      agentNameSnapshot: "Researcher",
    })
    const source = result.source
    if (!source) throw new Error("result source agent name snapshot missing")
    expect(validateNamedDeliveryEvent({
      identity: identity("data_exchange", "delivery:result"),
      deliveryId: "delivery:result",
      parentRunId: result.parentRunId,
      deliveryKind: "result_report",
      sender: source,
      recipient: { entityType: "knowbee", entityId: "agent:knowbee", agentNameSnapshot: "노비" },
      summary: "sub-agent result returned",
      resultReportId: result.resultReportId,
      createdAt: now,
    }).ok).toBe(true)

    const invalidAlias = validateNamedDeliveryEvent({
      identity: identity("data_exchange", "delivery:invalid-alias"),
      deliveryId: "delivery:invalid-alias",
      parentRunId: result.parentRunId,
      deliveryKind: "result_report",
      sender: { ...source, agentName: "Different Agent Name" },
      recipient: { entityType: "knowbee", entityId: "agent:knowbee", agentNameSnapshot: "노비" },
      summary: "sub-agent result returned",
      resultReportId: result.resultReportId,
      createdAt: now,
    })
    expect(invalidAlias.ok).toBe(false)
    expect(invalidAlias.issues.map((issue) => issue.path)).toContain("$.sender.agentName")
  })

  it("keeps historical sub-session agent name snapshots after an agent name changes", () => {
    upsertAgentConfig(subAgent({ agentId: "agent:researcher", agentName: "Researcher" }), { now })
    expect(insertRunSubSession(subSession("Researcher"), { now })).toBe(true)

    upsertAgentConfig(subAgent({ agentId: "agent:researcher", agentName: "Analyst" }), { now: now + 1 })
    const row = getRunSubSession("sub-session:1")
    const stored = JSON.parse(row?.contract_json ?? "{}") as Partial<SubSessionContract>

    expect(row?.agent_name).toBe("Researcher")
    expect(row?.agent_name_snapshot).toBe("Researcher")
    expect(stored.agentNameSnapshot).toBe("Researcher")
    expect(stored).not.toHaveProperty("agentNickname")
  })
})
