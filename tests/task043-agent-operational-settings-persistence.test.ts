import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { executeAgentOperationalSettingsCommand } from "../packages/core/src/agents/agent-operational-settings-command.js"
import { createSqliteAgentOperationalSettingsCommandPorts } from "../packages/core/src/agents/agent-operational-settings-repository.js"
import { createAgentPublicRef } from "../packages/core/src/agents/agent-public-reference.js"
import {
  closeDb,
  compareAndUpdateAgentOperationalSettings,
  getAgentConfig,
  getDb,
  upsertAgentConfig,
} from "../packages/core/src/db/index.js"
import { CONTRACT_SCHEMA_VERSION, type SubAgentConfig } from "../packages/core/src/index.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const roots: string[] = []
const now = 1_900_000_000_000
const agentId = "agent:settings-owner"
const otherAgentId = "agent:settings-other"
const agentRef = createAgentPublicRef(agentId)
let fixture: ReturnType<typeof createTestRuntimeConfigFixture>

function agent(id: string, name: string): SubAgentConfig {
  const owner = { ownerType: "sub_agent" as const, ownerId: id }
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: id,
    agentName: name,
    status: "enabled",
    role: `${name} role`,
    personality: "Precise and concise.",
    specialtyTags: ["preserved-tag"],
    avoidTasks: ["preserved-avoid"],
    modelProfile: { providerId: "openai", modelId: "gpt-4" },
    memoryPolicy: {
      owner,
      visibility: "private",
      readScopes: [owner],
      writeScope: owner,
      retentionPolicy: "long_term",
      writebackReviewRequired: true,
      rawWindowSize: 20,
      compactThreshold: 40,
      capsuleMode: "rolling_summary",
      lastCompactedAt: 123,
      capsuleCount: 2,
    },
    capabilityPolicy: {
      permissionProfile: {
        profileId: `permission:${id}`,
        riskCeiling: "safe",
        approvalRequiredFrom: "external",
        allowExternalNetwork: false,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [`/private/${id}`],
      },
      skillMcpAllowlist: {
        enabledSkillIds: ["skill:private"],
        enabledMcpServerIds: ["mcp:private"],
        enabledToolNames: ["tool.private"],
        disabledToolNames: [],
        secretScopeId: `secret:${id}`,
      },
      rateLimit: { maxConcurrentCalls: 2, maxCallsPerMinute: 10 },
    },
    teamIds: ["team:preserved"],
    delegation: { enabled: true, maxParallelSessions: 2 },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function envelope(kind: string, targetRevision: number, scope = "agent_settings:write") {
  return {
    actorRef: "webui",
    scope,
    mutationId: `mutation-${kind}-${targetRevision}`,
    targetRevision,
    purpose: `agent_settings_${kind}`,
    issuedAt: now,
    nonce: `nonce-${kind}-${targetRevision}`,
  }
}

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task043-settings-"))
  roots.push(root)
  fixture = createTestRuntimeConfigFixture({ rootDir: root })
  initializeTestDbRuntime(fixture.paths.stateDir)
  upsertAgentConfig(agent(agentId, "Settings Owner"), { now })
  upsertAgentConfig(agent(otherAgentId, "Settings Other"), { now })
  getDb()
    .prepare(
      `INSERT INTO memory_items (id, content, tags, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run("memory:preserved", "private memory marker", "private", agentId, now, now)
})

afterEach(() => {
  closeDb()
  while (roots.length) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function ports() {
  return createSqliteAgentOperationalSettingsCommandPorts({
    config: fixture.config,
    now: () => now,
  })
}

describe("Task 043 agent operational settings SQLite adapter", () => {
  it("migrates a durable receipt store without a raw payload column", () => {
    const columns = getDb()
      .prepare("PRAGMA table_info(agent_operational_settings_mutation_receipts)")
      .all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["nonce", "request_fingerprint", "receipt_json"]),
    )
    expect(columns.map((column) => column.name)).not.toEqual(
      expect.arrayContaining(["payload_json", "command_json", "settings_json"]),
    )
  })

  it("updates model, memory and permission with CAS while preserving private and unrelated state", async () => {
    const otherBefore = getAgentConfig(otherAgentId)?.config_json
    const memoryBefore = getDb().prepare("SELECT * FROM memory_items ORDER BY id").all()
    const modelCommand = {
      kind: "update_model" as const,
      agentRef,
      envelope: envelope("update_model", 2),
      value: {
        providerName: "provider-sensitive-marker",
        modelName: "model-sensitive-marker",
        effort: "high",
      },
    }
    const modelReceipt = await executeAgentOperationalSettingsCommand(modelCommand, ports())
    expect(modelReceipt).toMatchObject({ state: "active", revision: 2 })
    expect(await executeAgentOperationalSettingsCommand(modelCommand, ports())).toEqual(
      modelReceipt,
    )

    expect(
      await executeAgentOperationalSettingsCommand(
        {
          kind: "update_memory",
          agentRef,
          envelope: envelope("update_memory", 3),
          value: {
            retentionPolicy: "short_term",
            capsuleMode: "session_compaction",
            rawWindowSize: 12,
            compactThreshold: 24,
            writebackReviewRequired: false,
          },
        },
        ports(),
      ),
    ).toMatchObject({ state: "active", revision: 3 })

    expect(
      await executeAgentOperationalSettingsCommand(
        {
          kind: "update_permission",
          agentRef,
          envelope: envelope("update_permission", 4),
          value: {
            riskCeiling: "safe",
            approvalRequiredFrom: "moderate",
            allowExternalNetwork: false,
            allowFilesystemWrite: false,
            allowShellExecution: false,
            allowScreenControl: false,
          },
        },
        ports(),
      ),
    ).toMatchObject({ state: "active", revision: 4 })

    const stored = JSON.parse(getAgentConfig(agentId)?.config_json ?? "{}") as SubAgentConfig
    expect(stored).toMatchObject({
      agentName: "Settings Owner",
      role: "Settings Owner role",
      personality: "Precise and concise.",
      specialtyTags: ["preserved-tag"],
      avoidTasks: ["preserved-avoid"],
      teamIds: ["team:preserved"],
      delegation: { enabled: true, maxParallelSessions: 2 },
      profileVersion: 4,
      modelProfile: {
        providerId: "provider-sensitive-marker",
        modelId: "model-sensitive-marker",
        effort: "high",
      },
      memoryPolicy: {
        owner: { ownerType: "sub_agent", ownerId: agentId },
        readScopes: [{ ownerType: "sub_agent", ownerId: agentId }],
        writeScope: { ownerType: "sub_agent", ownerId: agentId },
        lastCompactedAt: 123,
        capsuleCount: 2,
        retentionPolicy: "short_term",
      },
      capabilityPolicy: {
        permissionProfile: {
          profileId: `permission:${agentId}`,
          allowedPaths: [`/private/${agentId}`],
          approvalRequiredFrom: "moderate",
        },
        skillMcpAllowlist: {
          enabledSkillIds: ["skill:private"],
          enabledMcpServerIds: ["mcp:private"],
          secretScopeId: `secret:${agentId}`,
        },
        rateLimit: { maxConcurrentCalls: 2, maxCallsPerMinute: 10 },
      },
    })
    expect(getDb().prepare("SELECT * FROM memory_items ORDER BY id").all()).toEqual(memoryBefore)
    expect(getAgentConfig(otherAgentId)?.config_json).toBe(otherBefore)

    const receiptRows = getDb()
      .prepare(
        `SELECT request_fingerprint, receipt_json
         FROM agent_operational_settings_mutation_receipts ORDER BY created_at, mutation_id`,
      )
      .all()
    const receiptStorage = JSON.stringify(receiptRows)
    expect(receiptStorage).not.toContain("provider-sensitive-marker")
    expect(receiptStorage).not.toContain("model-sensitive-marker")
    expect(receiptStorage).not.toContain(`/private/${agentId}`)
    expect(receiptStorage).not.toContain("secret:settings-owner")
  })

  it("rejects stale persistence and rolls verified failures back to the previous revision", async () => {
    const before = getAgentConfig(agentId)?.config_json
    const stale = compareAndUpdateAgentOperationalSettings({
      agentId,
      expectedRevision: 0,
      targetRevision: 1,
      modelProfile: { providerId: "stale", modelId: "stale" },
      memoryPolicy: agent(agentId, "ignored").memoryPolicy,
      permissionProfile: agent(agentId, "ignored").capabilityPolicy.permissionProfile,
      now,
    })
    expect(stale).toBe("revision_conflict")
    expect(getAgentConfig(agentId)?.config_json).toBe(before)

    const basePorts = ports()
    const receipt = await executeAgentOperationalSettingsCommand(
      {
        kind: "update_model",
        agentRef,
        envelope: envelope("update_model", 2),
        value: { providerName: "verify", modelName: "failure" },
      },
      {
        ...basePorts,
        verify: () => ({ ok: false, reasonCode: "forced_verify_failure" }),
      },
    )
    expect(receipt).toMatchObject({ state: "rolled_back", revision: 1 })
    expect(getAgentConfig(agentId)?.config_json).toBe(before)
  })
})
