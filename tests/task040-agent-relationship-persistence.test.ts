import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createAgentPublicRef } from "../packages/core/src/agents/agent-public-reference.js"
import { executeAgentRelationshipCommand } from "../packages/core/src/agents/agent-relationship-command.js"
import {
  buildSqliteAgentRelationshipProjection,
  createSqliteAgentRelationshipCommandPorts,
} from "../packages/core/src/agents/agent-relationship-repository.js"
import {
  closeDb,
  getAgentConfig,
  getDb,
  listAgentRelationships,
  upsertAgentConfig,
} from "../packages/core/src/db/index.js"
import { CONTRACT_SCHEMA_VERSION, type SubAgentConfig } from "../packages/core/src/index.js"
import {
  createAgentHierarchyService,
  createAgentHierarchyStorage,
} from "../packages/core/src/orchestration/hierarchy.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.js"

const roots: string[] = []
const now = 1_800_000_000_000
let fixture: ReturnType<typeof createTestRuntimeConfigFixture>

function agent(agentId: string, name: string): SubAgentConfig {
  const owner = { ownerType: "sub_agent" as const, ownerId: agentId }
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: name,
    status: "enabled",
    role: `${name} role`,
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
        profileId: `profile:${agentId}`,
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
    delegation: { enabled: true, maxParallelSessions: 1 },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task040-relationship-"))
  roots.push(root)
  fixture = createTestRuntimeConfigFixture({ rootDir: root })
  initializeTestDbRuntime(fixture.paths.stateDir)
  upsertAgentConfig(agent("agent:child", "Child"), { now })
  upsertAgentConfig(agent("agent:parent", "Parent"), { now })
  upsertAgentConfig(agent("agent:other", "Other"), { now })
})

afterEach(() => {
  closeDb()
  while (roots.length) {
    const root = roots.pop()
    if (root) rmSync(root, { recursive: true, force: true })
  }
})

function ports() {
  return createSqliteAgentRelationshipCommandPorts({
    config: fixture.config,
    storage: createAgentHierarchyStorage(fixture.paths),
    now: () => now,
  })
}

function mutation(input: {
  kind: "connect" | "reparent" | "disconnect"
  parentRef: string | null
  targetRevision: number
}) {
  return {
    kind: input.kind,
    childRef: createAgentPublicRef("agent:child"),
    parentRef: input.parentRef,
    envelope: {
      actorRef: "webui",
      scope: "agent_relationship:write",
      mutationId: `mutation-${input.kind}`,
      targetRevision: input.targetRevision,
      purpose: `relationship_${input.kind}`,
      issuedAt: now,
      nonce: `nonce-${input.kind}`,
    },
  }
}

describe("Task 040 agent relationship SQLite adapter", () => {
  it("migrates durable relationship receipt storage", () => {
    const columns = getDb()
      .prepare("PRAGMA table_info(agent_relationship_mutation_receipts)")
      .all() as Array<{ name: string }>
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["nonce", "request_fingerprint", "receipt_json"]),
    )
  })

  it("connects, reparents and disconnects one child-owned edge atomically", async () => {
    const rootId = fixture.config.orchestration.knowbee?.agentId ?? "agent:knowbee"
    const connect = mutation({
      kind: "connect",
      parentRef: createAgentPublicRef(rootId),
      targetRevision: 1,
    })
    const connected = await executeAgentRelationshipCommand(connect, ports())
    expect(connected).toMatchObject({ state: "active", revision: 1 })
    expect(await executeAgentRelationshipCommand(connect, ports())).toEqual(connected)

    const reparented = await executeAgentRelationshipCommand(
      mutation({
        kind: "reparent",
        parentRef: createAgentPublicRef("agent:parent"),
        targetRevision: 2,
      }),
      ports(),
    )
    expect(reparented).toMatchObject({ state: "active", revision: 2 })
    const rowsAfterReparent = listAgentRelationships({ childAgentId: "agent:child" })
    expect(rowsAfterReparent).toHaveLength(1)
    expect(rowsAfterReparent[0]).toMatchObject({
      edge_id: "relationship:agent:child",
      parent_agent_id: "agent:parent",
      status: "active",
      updated_at: 2,
    })
    const hierarchy = createAgentHierarchyService({
      config: fixture.config,
      storage: createAgentHierarchyStorage(fixture.paths),
      now: () => now,
    })
    expect(hierarchy.directChildren(rootId)).toHaveLength(0)
    expect(hierarchy.directChildren("agent:parent").map((item) => item.agent?.agentId)).toEqual([
      "agent:child",
    ])
    const otherConfig = JSON.parse(getAgentConfig("agent:other")?.config_json ?? "{}") as {
      memoryPolicy?: { owner?: { ownerId?: string } }
    }
    expect(otherConfig.memoryPolicy?.owner?.ownerId).toBe("agent:other")
    const projection = buildSqliteAgentRelationshipProjection({
      config: fixture.config,
      observedAt: now,
    })
    expect(projection.relationships).toEqual([
      expect.objectContaining({ parentName: "Parent", childName: "Child", depth: 1 }),
    ])
    expect(JSON.stringify(projection)).not.toMatch(/agent:child|agent:parent|edge_id|internal/iu)

    const disconnected = await executeAgentRelationshipCommand(
      mutation({ kind: "disconnect", parentRef: null, targetRevision: 3 }),
      ports(),
    )
    expect(disconnected).toMatchObject({ state: "active", revision: 3, parentRef: null })
    expect(listAgentRelationships({ childAgentId: "agent:child" })[0]).toMatchObject({
      status: "disabled",
      updated_at: 3,
    })
    expect(listAgentRelationships({ childAgentId: "agent:other", status: "active" })).toHaveLength(
      0,
    )
    expect(JSON.stringify(disconnected)).not.toMatch(/agent:child|agent:parent|edge_id|internal/iu)
  })

  it("rejects a cycle before writing", async () => {
    const rootId = fixture.config.orchestration.knowbee?.agentId ?? "agent:knowbee"
    await executeAgentRelationshipCommand(
      mutation({
        kind: "connect",
        parentRef: createAgentPublicRef(rootId),
        targetRevision: 1,
      }),
      ports(),
    )
    const parentConnect = mutation({
      kind: "connect",
      parentRef: createAgentPublicRef("agent:child"),
      targetRevision: 2,
    })
    parentConnect.childRef = createAgentPublicRef("agent:parent")
    parentConnect.envelope.mutationId = "mutation-parent-connect"
    parentConnect.envelope.nonce = "nonce-parent-connect"
    expect(await executeAgentRelationshipCommand(parentConnect, ports())).toMatchObject({
      state: "active",
    })
    expect(
      await executeAgentRelationshipCommand(
        mutation({
          kind: "reparent",
          parentRef: createAgentPublicRef("agent:parent"),
          targetRevision: 3,
        }),
        ports(),
      ),
    ).toMatchObject({ state: "rejected", reasonCode: "cycle_detected" })
    expect(
      listAgentRelationships({ childAgentId: "agent:child", status: "active" })[0],
    ).toMatchObject({
      parent_agent_id: rootId,
    })
  })
})
