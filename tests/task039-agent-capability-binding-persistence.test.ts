import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { executeAgentCapabilityBindingCommand } from "../packages/core/src/agents/agent-capability-binding-command.js"
import { createSqliteAgentCapabilityBindingCommandPorts } from "../packages/core/src/agents/agent-capability-binding-repository.js"
import { createAgentPublicRef } from "../packages/core/src/agents/agent-public-reference.js"
import { createMcpPublicRef } from "../packages/core/src/capabilities/mcp-public-reference.js"
import { createSkillPublicRef } from "../packages/core/src/capabilities/skill-public-reference.js"
import {
  closeDb,
  getDb,
  listAgentCapabilityBindings,
  upsertAgentConfig,
  upsertMcpServerCatalogEntry,
  upsertSkillCatalogEntry,
} from "../packages/core/src/db/index.js"
import { CONTRACT_SCHEMA_VERSION, type SubAgentConfig } from "../packages/core/src/index.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const roots: string[] = []
const now = 1_800_000_000_000
const agentId = "agent:task039"
const agentRef = createAgentPublicRef(agentId)

function agent(): SubAgentConfig {
  const owner = { ownerType: "sub_agent" as const, ownerId: agentId }
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: "Binding Tester",
    status: "enabled",
    role: "Verify bindings",
    personality: "Precise and concise.",
    specialtyTags: [],
    avoidTasks: [],
    memoryPolicy: {
      owner,
      visibility: "private",
      readScopes: [owner],
      writeScope: owner,
      retentionPolicy: "long_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: {
        profileId: "profile:task039",
        riskCeiling: "safe",
        approvalRequiredFrom: "external",
        allowExternalNetwork: false,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [],
      },
      skillMcpAllowlist: {
        enabledSkillIds: [],
        enabledMcpServerIds: [],
        enabledToolNames: [],
        disabledToolNames: [],
      },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    teamIds: [],
    delegation: { enabled: false, maxParallelSessions: 1 },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task039-binding-"))
  roots.push(root)
  const fixture = createTestRuntimeConfigFixture({ rootDir: root })
  initializeTestDbRuntime(fixture.paths.stateDir)
  upsertAgentConfig(agent(), { now })
})

afterEach(() => {
  closeDb()
  while (roots.length) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function envelope(input: {
  mutationId: string
  nonce: string
  purpose: string
  targetRevision: number
}) {
  return {
    actorRef: "webui",
    scope: "capability:write",
    issuedAt: now,
    ...input,
  }
}

describe("Task 039 agent capability binding persistence", () => {
  it("adds backward-compatible receipt fingerprint columns", () => {
    const columns = getDb()
      .prepare("PRAGMA table_info(capability_mutation_receipts)")
      .all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["request_fingerprint", "receipt_json"]),
    )
  })

  it("persists and replays a Skill binding without leaking internal ids", async () => {
    upsertSkillCatalogEntry(
      { skillId: "skill:private", displayName: "UI UX Pro Max", status: "enabled", updatedAt: 10 },
      { now: 10 },
    )
    const command = {
      kind: "skill" as const,
      agentRef,
      capabilityRef: createSkillPublicRef("skill:private"),
      bound: true,
      envelope: envelope({
        mutationId: "skill-bind-1",
        nonce: "skill-nonce-1",
        purpose: "skill_bind",
        targetRevision: 11,
      }),
    }
    const first = await executeAgentCapabilityBindingCommand(
      command,
      createSqliteAgentCapabilityBindingCommandPorts({ now: () => now }),
    )
    expect(first).toMatchObject({ state: "active", bound: true, revision: 11 })
    expect(listAgentCapabilityBindings({ agentId, capabilityKind: "skill" })[0]).toMatchObject({
      status: "enabled",
      updated_at: 11,
    })
    const replayed = await executeAgentCapabilityBindingCommand(
      command,
      createSqliteAgentCapabilityBindingCommandPorts({ now: () => now }),
    )
    expect(replayed).toEqual(first)
    expect(JSON.stringify(replayed)).not.toMatch(/agent:task039|skill:private|binding_id/iu)
  })

  it("isolates MCP binding revision and rejects a reused nonce for another target", async () => {
    upsertMcpServerCatalogEntry(
      { mcpServerId: "mcp:penpot", displayName: "Penpot", status: "enabled", updatedAt: 20 },
      { now: 20 },
    )
    const base = {
      kind: "mcp_server" as const,
      agentRef,
      capabilityRef: createMcpPublicRef("mcp:penpot"),
      bound: true,
      envelope: envelope({
        mutationId: "mcp-bind-1",
        nonce: "mcp-nonce-1",
        purpose: "mcp_bind",
        targetRevision: 21,
      }),
    }
    const ports = createSqliteAgentCapabilityBindingCommandPorts({ now: () => now })
    expect(await executeAgentCapabilityBindingCommand(base, ports)).toMatchObject({
      state: "active",
      revision: 21,
    })
    const collision = await executeAgentCapabilityBindingCommand(
      { ...base, capabilityRef: createMcpPublicRef("mcp:other") },
      createSqliteAgentCapabilityBindingCommandPorts({ now: () => now }),
    )
    expect(collision).toMatchObject({ state: "conflict", reasonCode: "mutation_nonce_conflict" })
    expect(listAgentCapabilityBindings({ agentId, capabilityKind: "skill" })).toHaveLength(0)
    expect(listAgentCapabilityBindings({ agentId, capabilityKind: "mcp_server" })).toHaveLength(1)
  })

  it("does not mix a saved binding into another agent", async () => {
    const other = agent()
    other.agentId = "agent:task039-other"
    other.agentName = "Other Agent"
    other.memoryPolicy = {
      ...other.memoryPolicy,
      owner: { ownerType: "sub_agent", ownerId: other.agentId },
      readScopes: [{ ownerType: "sub_agent", ownerId: other.agentId }],
      writeScope: { ownerType: "sub_agent", ownerId: other.agentId },
    }
    upsertAgentConfig(other, { now })
    upsertSkillCatalogEntry(
      {
        skillId: "skill:isolated",
        displayName: "Isolated Skill",
        status: "enabled",
        updatedAt: 30,
      },
      { now: 30 },
    )
    const result = await executeAgentCapabilityBindingCommand(
      {
        kind: "skill",
        agentRef,
        capabilityRef: createSkillPublicRef("skill:isolated"),
        bound: true,
        envelope: envelope({
          mutationId: "isolated-bind-1",
          nonce: "isolated-nonce-1",
          purpose: "skill_bind",
          targetRevision: 31,
        }),
      },
      createSqliteAgentCapabilityBindingCommandPorts({ now: () => now }),
    )
    expect(result.state).toBe("active")
    expect(listAgentCapabilityBindings({ agentId, capabilityKind: "skill" })).toHaveLength(1)
    expect(
      listAgentCapabilityBindings({ agentId: other.agentId, capabilityKind: "skill" }),
    ).toHaveLength(0)
    expect(other.memoryPolicy.owner.ownerId).toBe(other.agentId)
  })
})
