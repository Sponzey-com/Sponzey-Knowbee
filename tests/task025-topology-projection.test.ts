import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAgentRoutes } from "../packages/core/src/api/routes/agent.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  CONTRACT_SCHEMA_VERSION,
  type MemoryPolicy,
  type PermissionProfile,
  type RuntimeIdentity,
  type SkillMcpAllowlist,
  type SubAgentConfig,
  type TeamConfig,
  type TeamMembership,
} from "../packages/core/src/index.ts"
import {
  buildTopologyAgentCreatePayload,
  buildTopologyTeamCreatePayload,
} from "../packages/webui/src/lib/topology.ts"
import {
  createTestRuntimeConfigFixture,
  type TestRuntimeConfigFixture,
} from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: {
    method: string
    url: string
    payload?: unknown
  }): Promise<{ statusCode: number; json(): Record<string, unknown> }>
}

type FastifyTestApp = ReturnType<typeof Fastify>

const tempDirs: string[] = []
const now = Date.UTC(2026, 3, 24, 0, 0, 0)
let runtimeFixture: TestRuntimeConfigFixture

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task025-topology-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function owner(
  ownerType: RuntimeIdentity["owner"]["ownerType"] = "knowbee",
  ownerId = "agent:knowbee",
): RuntimeIdentity["owner"] {
  return { ownerType, ownerId }
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["research"],
  enabledMcpServerIds: ["browser"],
  enabledToolNames: ["web_search"],
  disabledToolNames: ["shell_exec"],
  secretScopeId: "sk-task025-secret-scope-1234567890",
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: ["/Users/dongwooshin/private/topology-secret.txt"],
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: owner("sub_agent", agentId),
    visibility: "private",
    readScopes: [owner("sub_agent", agentId)],
    writeScope: owner("sub_agent", agentId),
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

function subAgentConfig(
  agentId: string,
  nickname: string,
  overrides: Partial<SubAgentConfig> = {},
): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName: nickname,
    status: "enabled",
    role: `${nickname} worker`,
    personality: "Precise",
    specialtyTags: ["research"],
    avoidTasks: [],
    modelProfile: {
      providerId: "openai",
      modelId: "gpt-5.4-mini",
      fallbackModelId: "gpt-5.4",
    },
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    delegationPolicy: { enabled: true, maxParallelSessions: 2 },
    teamIds: ["team:topology"],
    delegation: { enabled: true, maxParallelSessions: 2 },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function membership(
  teamId: string,
  agentId: string,
  roles: string[],
  sortOrder: number,
): TeamMembership {
  return {
    membershipId: `${teamId}:membership:${sortOrder}`,
    teamId,
    agentId,
    ownerAgentIdSnapshot: "agent:alpha",
    teamRoles: roles,
    primaryRole: roles[0] ?? "member",
    required: true,
    sortOrder,
    status: "active",
  }
}

function teamConfig(): TeamConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    teamId: "team:topology",
    displayName: "Topology Team",
    status: "enabled",
    purpose: "Validate topology overlays without raw memory.",
    ownerAgentId: "agent:alpha",
    leadAgentId: "agent:alpha",
    memberCountMin: 1,
    memberCountMax: 4,
    requiredTeamRoles: ["member", "reviewer"],
    requiredCapabilityTags: ["research"],
    resultPolicy: "lead_synthesis",
    conflictPolicy: "lead_decides",
    memberships: [
      membership("team:topology", "agent:beta", ["member"], 0),
      membership("team:topology", "agent:gamma", ["reviewer"], 1),
    ],
    memberAgentIds: ["agent:beta", "agent:gamma"],
    roleHints: ["member", "reviewer"],
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

async function createAgent(
  app: FastifyTestApp,
  agentId: string,
  nickname: string,
  overrides: Partial<SubAgentConfig> = {},
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: "/api/agents",
    payload: { agent: subAgentConfig(agentId, nickname, overrides) },
  })
  expect(response.statusCode, response.body).toBe(200)
}

async function createRelationship(
  app: FastifyTestApp,
  parentAgentId: string,
  childAgentId: string,
): Promise<void> {
  const response = await app.inject({
    method: "POST",
    url: "/api/agent-relationships",
    payload: { relationship: { parentAgentId, childAgentId } },
  })
  expect(response.statusCode).toBe(200)
}

async function seedTopology(app: FastifyTestApp): Promise<void> {
  await createAgent(app, "agent:alpha", "Alpha")
  await createAgent(app, "agent:beta", "Beta")
  await createAgent(app, "agent:gamma", "Gamma")
  await createRelationship(app, "agent:knowbee", "agent:alpha")
  await createRelationship(app, "agent:alpha", "agent:beta")
  await createRelationship(app, "agent:knowbee", "agent:gamma")
  const team = await app.inject({
    method: "POST",
    url: "/api/teams",
    payload: { team: teamConfig() },
  })
  expect(team.statusCode).toBe(200)
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  expect(Array.isArray(value)).toBe(true)
  return value as Array<Record<string, unknown>>
}

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toEqual(expect.any(Object))
  return value as Record<string, unknown>
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

describe("task025 topology projection", () => {
  it("projects hierarchy, team overlays, badges, inspectors, and redacted summaries", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAgentRoutes(app)
    await app.ready()
    try {
      await seedTopology(app)

      const response = await app.inject({ method: "GET", url: "/api/agent-topology" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      const nodes = asRecords(body.nodes)
      const edges = asRecords(body.edges)
      expect(nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "knowbee" }),
          expect.objectContaining({ kind: "sub_agent", entityId: "agent:alpha" }),
          expect.objectContaining({ kind: "team", entityId: "team:topology" }),
        ]),
      )
      expect(nodes.some((node) => node.kind === "team_role" || node.kind === "team_lead")).toBe(
        false,
      )
      expect(edges).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "parent_child", style: "hierarchy" }),
          expect.objectContaining({ kind: "team_membership", style: "lead" }),
          expect.objectContaining({ kind: "team_membership", style: "membership_reference" }),
        ]),
      )
      expect(edges).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "parent_child",
            source: "agent:agent:alpha",
            target: "agent:agent:beta",
          }),
        ]),
      )

      const inspectors = asRecord(body.inspectors)
      const agents = asRecord(inspectors.agents)
      const alpha = asRecord(agents["agent:alpha"])
      expect(asRecord(alpha.skillMcp).secretScope).toBe("configured")
      expect(asRecord(alpha.memory).visibility).toBe("private")
      const teams = asRecord(inspectors.teams)
      const team = asRecord(teams["team:topology"])
      const teamNode = nodes.find((item) => item.entityId === "team:topology")
      expect(team.displayName).toBe("Topology Team")
      expect(team).not.toHaveProperty("nickname")
      expect(teamNode?.label).toBe("Topology Team")
      expect(teamNode?.label).not.toBe("Legacy Team Nick")
      const builder = asRecord(team.builder)
      const gamma = asRecords(builder.candidates).find(
        (candidate) => candidate.agentId === "agent:gamma",
      )
      expect(gamma).toEqual(
        expect.objectContaining({
          directChild: false,
          canActivate: false,
          reasonCodes: expect.arrayContaining(["owner_direct_child_required"]),
        }),
      )
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain("sk-task025-secret")
      expect(serialized).not.toContain("private/topology-secret")
      expect(serialized).not.toContain("private raw memory")
    } finally {
      await app.close()
    }
  })

  it("projects the canonical agentName", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAgentRoutes(app)
    await app.ready()
    try {
      await createAgent(app, "agent:canonical", "Legacy Display", {
        agentName: "정식 이름",
      })
      await createRelationship(app, "agent:knowbee", "agent:canonical")

      const response = await app.inject({ method: "GET", url: "/api/agent-topology" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      const nodes = asRecords(body.nodes)
      const inspectors = asRecord(body.inspectors)
      const agents = asRecord(inspectors.agents)
      const canonical = asRecord(agents["agent:canonical"])
      const node = nodes.find((item) => item.entityId === "agent:canonical")

      expect(canonical.agentName).toBe("정식 이름")
      expect(canonical.displayName).toBe("정식 이름")
      expect(canonical).not.toHaveProperty("nickname")
      expect(node?.label).toBe("정식 이름")
    } finally {
      await app.close()
    }
  })

  it("uses the canonical agentName in projection member and builder labels", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAgentRoutes(app)
    await app.ready()
    try {
      await createAgent(app, "agent:alpha", "Alpha")
      await createAgent(app, "agent:legacy", "Legacy Nick", {
        agentName: "Visible Agent",
      })
      await createRelationship(app, "agent:knowbee", "agent:alpha")
      await createRelationship(app, "agent:alpha", "agent:legacy")
      const team = await app.inject({
        method: "POST",
        url: "/api/teams",
        payload: {
          team: {
            ...teamConfig(),
            memberAgentIds: ["agent:legacy"],
            memberships: [membership("team:topology", "agent:legacy", ["member"], 0)],
            roleHints: ["member"],
          },
        },
      })
      expect(team.statusCode).toBe(200)

      const response = await app.inject({ method: "GET", url: "/api/agent-topology" })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      const teams = asRecord(asRecord(body.inspectors).teams)
      const topologyTeam = asRecord(teams["team:topology"])
      const member = asRecords(topologyTeam.members).find((item) => item.agentId === "agent:legacy")
      const builder = asRecord(topologyTeam.builder)
      const candidate = asRecords(builder.candidates).find((item) => item.agentId === "agent:legacy")

      expect(member?.label).toBe("Visible Agent")
      expect(candidate?.label).toBe("Visible Agent")
      expect(member?.label).not.toBe("Legacy Display")
      expect(candidate?.label).not.toBe("Legacy Nick")
    } finally {
      await app.close()
    }
  })

  it("keeps topology projection source free of legacy agent label fallback chains", () => {
    const source = readFileSync(
      new URL("../packages/core/src/orchestration/topology-projection.ts", import.meta.url),
      "utf-8",
    )

    expect(source).not.toContain("agent?.agentName ?? agent?.nickname ?? agent?.displayName")
    expect(source).not.toContain("agent.agentName ?? agent.nickname ?? agent.displayName")
    expect(source).not.toContain("input.agent?.agentName ?? input.node.label")
    expect(source).not.toContain("input.team.nickname ?? input.team.displayName")
  })

  it("validates invalid hierarchy edges and blocks non-direct active team member saves", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAgentRoutes(app)
    await app.ready()
    try {
      await seedTopology(app)

      const cycle = await app.inject({
        method: "POST",
        url: "/api/agent-topology/edges/validate",
        payload: {
          edge: {
            kind: "parent_child",
            relationship: { parentAgentId: "agent:beta", childAgentId: "agent:alpha" },
          },
        },
      })
      expect(cycle.statusCode).toBe(200)
      expect(cycle.json()).toEqual(expect.objectContaining({ valid: false }))
      expect(
        asRecords(cycle.json().diagnostics).map((diagnostic) => diagnostic.reasonCode),
      ).toContain("cycle_detected")

      const membershipValidation = await app.inject({
        method: "POST",
        url: "/api/agent-topology/edges/validate",
        payload: {
          edge: {
            kind: "team_membership",
            teamId: "team:topology",
            agentId: "agent:gamma",
            memberStatus: "active",
          },
        },
      })
      expect(membershipValidation.statusCode).toBe(200)
      expect(membershipValidation.json()).toEqual(expect.objectContaining({ valid: false }))

      const save = await app.inject({
        method: "PUT",
        url: "/api/teams/team:topology/members",
        payload: {
          memberAgentIds: ["agent:beta", "agent:gamma"],
          roleHints: ["member", "reviewer"],
          memberships: [
            membership("team:topology", "agent:beta", ["member"], 0),
            membership("team:topology", "agent:gamma", ["reviewer"], 1),
          ],
        },
      })
      expect(save.statusCode).toBe(400)
      expect(save.json()).toEqual(
        expect.objectContaining({ reasonCode: "owner_direct_child_required" }),
      )
    } finally {
      await app.close()
    }
  })

  it("accepts topology editor create and archive payloads", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAgentRoutes(app)
    await app.ready()
    try {
      await seedTopology(app)
      const agentPayload = buildTopologyAgentCreatePayload({
        kind: "agent",
        name: "Delta",
        detail: "reviewer",
        now,
      })
      const teamPayload = buildTopologyTeamCreatePayload({
        kind: "team",
        name: "Delta Review",
        detail: "Review delegated outputs.",
        parentAgentId: "agent:alpha",
        leadAgentId: "agent:alpha",
        memberAgentIds: ["agent:beta"],
        now,
      })

      const createdAgent = await app.inject({
        method: "POST",
        url: "/api/agents",
        payload: { agent: agentPayload.agent },
      })
      expect(createdAgent.statusCode).toBe(200)
      const createdTeam = await app.inject({
        method: "POST",
        url: "/api/teams",
        payload: { team: teamPayload.team },
      })
      expect(createdTeam.statusCode).toBe(200)

      const topology = await app.inject({ method: "GET", url: "/api/agent-topology" })
      expect(topology.statusCode).toBe(200)
      expect(asRecords(topology.json().nodes)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "sub_agent", entityId: "agent:delta" }),
          expect.objectContaining({ kind: "team", entityId: "team:delta-review" }),
        ]),
      )
      expect(asRecords(topology.json().edges)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "parent_child", target: "agent:agent:delta" }),
        ]),
      )

      const archivedAgent = await app.inject({
        method: "POST",
        url: "/api/agents/agent%3Adelta/archive",
      })
      const archivedTeam = await app.inject({
        method: "POST",
        url: "/api/teams/team%3Adelta-review/archive",
      })
      expect(archivedAgent.statusCode).toBe(200)
      expect(archivedTeam.statusCode).toBe(200)

      const deletedTeam = await app.inject({
        method: "DELETE",
        url: "/api/teams/team%3Adelta-review",
      })
      expect(deletedTeam.statusCode).toBe(200)
      const deletedTopology = await app.inject({ method: "GET", url: "/api/agent-topology" })
      expect(asRecords(deletedTopology.json().nodes)).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "team", entityId: "team:delta-review" }),
        ]),
      )
    } finally {
      await app.close()
    }
  })
})
