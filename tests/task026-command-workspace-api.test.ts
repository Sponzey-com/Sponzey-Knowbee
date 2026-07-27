import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerCommandPaletteRoutes } from "../packages/core/src/api/routes/command-palette.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
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
  SubAgentConfig,
  SubSessionContract,
  TeamConfig,
  TeamMembership,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  closeDb,
  getRunSubSession,
  insertRunSubSession,
  upsertAgentRelationship,
} from "../packages/core/src/db/index.js"
import {
  clearFocusBinding,
  createAgentRegistryService,
  createTeamRegistryService,
  importExternalAgentProfileDraft,
  instantiateAgentTemplate,
  resolveFocusBinding,
  searchCommandPalette,
  setFocusBinding,
} from "../packages/core/src/index.ts"
import {
  createCommandWorkspaceStorage,
  type CommandWorkspaceStorage,
} from "../packages/core/src/orchestration/command-workspace.ts"
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

const now = Date.UTC(2026, 3, 24, 0, 0, 0)
const tempDirs: string[] = []
let focusStorage: CommandWorkspaceStorage | undefined
let runtimeFixture: TestRuntimeConfigFixture

function getFocusStorage(): CommandWorkspaceStorage {
  if (!focusStorage) throw new Error("focus storage fixture is not initialized")
  return focusStorage
}

const permissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: false,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: ["research"],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

const expectedOutput: ExpectedOutputContract = {
  outputId: "answer",
  kind: "text",
  description: "Task026 command workspace answer.",
  required: true,
  acceptance: {
    requiredEvidenceKinds: [],
    artifactRequired: false,
    reasonCodes: ["task026"],
  },
}

const taskScope: StructuredTaskScope = {
  goal: "Validate command workspace routing.",
  intentType: "runtime_test",
  actionType: "command_workspace",
  constraints: ["Parent owns final synthesis."],
  expectedOutputs: [expectedOutput],
  reasonCodes: ["task026"],
}

function owner(ownerId = "agent:knowbee"): RuntimeIdentity["owner"] {
  return { ownerType: ownerId === "agent:knowbee" ? "knowbee" : "sub_agent", ownerId }
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

function subAgentConfig(agentId: string, agentName: string): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName,
    displayName: `Legacy ${agentName} Display`,
    nickname: `Legacy ${agentName} Nick`,
    status: "enabled",
    role: `${agentName} research worker`,
    personality: "Precise and scoped.",
    specialtyTags: ["research", "review"],
    avoidTasks: ["Do not bypass parent synthesis."],
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: { ...allowlist, secretScopeId: agentId },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 2,
    },
    teamIds: ["team:alpha"],
    delegation: {
      enabled: true,
      maxParallelSessions: 2,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function membership(teamId: string, agentId: string, index = 0): TeamMembership {
  return {
    membershipId: `${teamId}:membership:${index}`,
    teamId,
    agentId,
    ownerAgentIdSnapshot: "agent:knowbee",
    teamRoles: ["member"],
    primaryRole: "member",
    required: true,
    sortOrder: index,
    status: "active",
  }
}

function teamConfig(): TeamConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    teamId: "team:alpha",
    displayName: "Alpha Team",
    status: "enabled",
    purpose: "Task026 direct child team.",
    ownerAgentId: "agent:knowbee",
    leadAgentId: "agent:alpha",
    memberCountMin: 1,
    memberCountMax: 1,
    requiredTeamRoles: ["member"],
    requiredCapabilityTags: ["research"],
    resultPolicy: "lead_synthesis",
    conflictPolicy: "lead_decides",
    memberships: [membership("team:alpha", "agent:alpha")],
    memberAgentIds: ["agent:alpha"],
    roleHints: ["member"],
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function identity(entityType: RuntimeIdentity["entityType"], entityId: string): RuntimeIdentity {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    entityType,
    entityId,
    owner: owner(),
    idempotencyKey: `idem:${entityId}`,
    auditCorrelationId: `audit:${entityId}`,
    parent: {
      parentRunId: "run:task026",
      parentRequestId: "request:task026",
    },
  }
}

function command(id: string): CommandRequest {
  return {
    identity: identity("sub_session", `command:${id}`),
    commandRequestId: `command:${id}`,
    parentRunId: "run:task026",
    subSessionId: `sub:${id}`,
    targetAgentId: "agent:alpha",
    targetAgentNameSnapshot: "Alpha",
    taskScope,
    contextPackageIds: [],
    expectedOutputs: [expectedOutput],
  }
}

function promptBundle(): AgentPromptBundle {
  return {
    identity: identity("capability", "prompt-bundle:task026"),
    bundleId: "prompt-bundle:task026",
    agentId: "agent:alpha",
    agentType: "sub_agent",
    role: "research worker",
    personalitySnapshot: "Precise",
    teamContext: [],
    memoryPolicy: memoryPolicy("agent:alpha"),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    taskScope,
    safetyRules: ["Return to parent synthesis only."],
    sourceProvenance: [{ sourceId: "profile:agent:alpha", version: "1" }],
    completionCriteria: [expectedOutput],
    createdAt: now,
  }
}

function subSessionContract(id: string): SubSessionContract {
  return {
    identity: identity("sub_session", `sub:${id}`),
    subSessionId: `sub:${id}`,
    parentSessionId: "session:task026",
    parentRunId: "run:task026",
    parentAgentId: "agent:knowbee",
    parentAgentName: "Knowbee",
    agentId: "agent:alpha",
    agentName: "Alpha",
    agentNameSnapshot: "Alpha",
    commandRequestId: command(id).commandRequestId,
    status: "running",
    promptBundleId: "prompt-bundle:task026",
    promptBundleSnapshot: promptBundle(),
    startedAt: now,
  }
}

function legacySubSessionContract(id: string): SubSessionContract {
  const contract = subSessionContract(id)
  delete (contract as Partial<SubSessionContract>).agentNameSnapshot
  contract.agentDisplayName = "Legacy Session Display"
  return contract
}

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task026-command-"))
  tempDirs.push(stateDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir: stateDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
  focusStorage = createCommandWorkspaceStorage({ stateDir: runtimeFixture.paths.stateDir })
}

function restoreState(): void {
  closeDb()
  focusStorage = undefined
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
}

function seedRegistry(): void {
  const config = runtimeFixture.config
  const agents = createAgentRegistryService({ config })
  agents.createOrUpdate(subAgentConfig("agent:alpha", "Alpha"), { now })
  agents.createOrUpdate(subAgentConfig("agent:gamma", "Gamma"), { now })
  createTeamRegistryService({ config }).createOrUpdate(teamConfig(), { now })
  upsertAgentRelationship({
    edgeId: "edge:knowbee-alpha",
    parentAgentId: "agent:knowbee",
    childAgentId: "agent:alpha",
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })
  upsertAgentRelationship({
    edgeId: "edge:alpha-gamma",
    parentAgentId: "agent:alpha",
    childAgentId: "agent:gamma",
    relationshipType: "parent_child",
    status: "active",
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  })
}

async function withApp(run: (app: ReturnType<typeof Fastify>) => Promise<void>): Promise<void> {
  const app = Fastify({ logger: false })
  installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
  registerCommandPaletteRoutes(app)
  await app.ready()
  try {
    await run(app)
  } finally {
    await app.close()
  }
}

beforeEach(() => {
  useTempState()
  seedRegistry()
})

afterEach(() => {
  clearFocusBinding("thread:task026", getFocusStorage())
  restoreState()
})

describe("task026 command workspace API", () => {
  it("searches agents, teams, commands, templates, and sub-sessions", async () => {
    insertRunSubSession(subSessionContract("search"), { now })

    const direct = searchCommandPalette({ config: runtimeFixture.config, query: "Alpha", limit: 20 })
    expect(direct.results.map((item) => item.kind)).toEqual(
      expect.arrayContaining(["agent", "team", "sub_session"]),
    )
    const agent = direct.results.find((item) => item.kind === "agent" && item.id === "agent:alpha")
    expect(agent).toMatchObject({
      title: "Alpha",
      target: { kind: "agent", id: "agent:alpha", label: "Alpha" },
    })
    expect(JSON.stringify(agent)).not.toContain("Legacy Alpha")
    const team = direct.results.find((item) => item.kind === "team" && item.id === "team:alpha")
    expect(team).toMatchObject({
      title: "Alpha Team",
      target: { kind: "team", id: "team:alpha", label: "Alpha Team" },
    })
    expect(JSON.stringify(team)).not.toContain("@")

    await withApp(async (app) => {
      const response = await app.inject({
        method: "GET",
        url: "/api/command-palette/search?q=template&limit=20",
      })
      expect(response.statusCode).toBe(200)
      const body = response.json()
      expect(body.results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "agent_template" }),
          expect.objectContaining({ kind: "team_template" }),
        ]),
      )
    })
  })

  it("does not expose legacy sub-session displayName or nickname as command labels", () => {
    insertRunSubSession(legacySubSessionContract("legacy-label"), { now })

    const result = searchCommandPalette({
      config: runtimeFixture.config,
      query: "sub:legacy-label",
      limit: 20,
    })
    const subSession = result.results.find((item) => item.kind === "sub_session" && item.id === "sub:legacy-label")

    expect(subSession).toMatchObject({
      title: "sub:legacy-label -> Unnamed sub-agent",
      target: { kind: "sub_session", id: "sub:legacy-label", label: "Unnamed sub-agent" },
    })
    expect(JSON.stringify(subSession)).not.toContain("Legacy Session Display")
  })

  it("creates agent template and imported drafts with agentName only", () => {
    const template = instantiateAgentTemplate({
      templateId: "coding",
      overrides: {
        agentId: "agent:template:agent-name-only",
        displayName: "Template Display Alias",
        nickname: "Template Legacy Nick",
      },
      persist: false,
    })
    expect(template.ok).toBe(true)
    if (!template.ok) throw new Error(template.reasonCode)
    expect(template.draft.agent).toEqual(expect.objectContaining({
      agentId: "agent:template:agent-name-only",
      agentName: "Template Display Alias",
    }))
    expect(template.draft.agent).not.toHaveProperty("displayName")
    expect(template.draft.agent).not.toHaveProperty("nickname")
    expect(template.draft.agent).not.toHaveProperty("normalizedNickname")

    const imported = importExternalAgentProfileDraft({
      source: "legacy",
      profile: {
        displayName: "External Legacy Display",
        name: "External Name",
        systemPrompt: "Draft instructions.",
      },
      overrides: {
        agentId: "agent:import:agent-name-only",
        agentName: "Imported Agent Name",
        displayName: "Imported Legacy Display",
        nickname: "Imported Legacy Nick",
      },
      persist: false,
    })
    expect(imported.ok).toBe(true)
    if (!imported.ok) throw new Error(imported.reasonCode)
    expect(imported.draft.agent).toEqual(expect.objectContaining({
      agentId: "agent:import:agent-name-only",
      agentName: "Imported Agent Name",
    }))
    expect(imported.draft.agent).not.toHaveProperty("displayName")
    expect(imported.draft.agent).not.toHaveProperty("nickname")
    expect(imported.draft.agent).not.toHaveProperty("normalizedNickname")
  })

  it("maps sub-session slash aliases to existing control operations", async () => {
    insertRunSubSession(subSessionContract("alias"), { now })

    await withApp(async (app) => {
      const info = await app.inject({
        method: "POST",
        url: "/api/commands/execute",
        payload: { command: "/subsessions info sub:alias" },
      })
      expect(info.statusCode).toBe(200)
      expect(info.json()).toMatchObject({ ok: true, reasonCode: "subsession_info" })

      const steer = await app.inject({
        method: "POST",
        url: "/api/commands/execute",
        payload: { command: "/subsessions steer sub:alias tighten scope" },
      })
      expect(steer.statusCode).toBe(202)
      expect(steer.json()).toMatchObject({ ok: true, reasonCode: "sub_session_steer_accepted" })

      const kill = await app.inject({
        method: "POST",
        url: "/api/commands/execute",
        payload: { command: "/subsessions kill sub:alias done" },
      })
      expect(kill.statusCode).toBe(202)
      expect(kill.json()).toMatchObject({ ok: true, reasonCode: "sub_session_kill_accepted" })
      expect(getRunSubSession("sub:alias")?.status).toBe("cancelled")
    })
  })

  it("binds focus only as a validated explicit planner target", async () => {
    const focus = setFocusBinding({
      config: runtimeFixture.config,
      threadId: "thread:task026",
      target: { kind: "agent", id: "agent:alpha", label: "Alpha" },
    }, getFocusStorage())
    expect(focus.ok).toBe(true)
    if (!focus.ok) throw new Error(focus.reasonCode)
    expect(focus.plannerIntent).toEqual({ explicitAgentId: "agent:alpha" })
    expect(focus.enforcement).toMatchObject({
      directChildVisibility: "checked",
      finalAnswerOwnerUnchanged: true,
      memoryIsolationUnchanged: true,
    })

    const resolved = resolveFocusBinding(
      { config: runtimeFixture.config, threadId: "thread:task026" },
      getFocusStorage(),
    )
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) throw new Error(resolved.reasonCode)
    expect(resolved.plannerTarget).toMatchObject({ kind: "explicit_agent", id: "agent:alpha" })

    const hidden = setFocusBinding({
      config: runtimeFixture.config,
      threadId: "thread:task026",
      target: { kind: "agent", id: "agent:gamma" },
    }, getFocusStorage())
    expect(hidden.ok).toBe(false)
    if (hidden.ok) throw new Error("expected direct child rejection")
    expect(hidden.reasonCode).toBe("focus_target_not_direct_child")

    const cleared = clearFocusBinding("thread:task026", getFocusStorage())
    expect(cleared.cleared).toBe(true)
    expect(resolveFocusBinding(
      { config: runtimeFixture.config, threadId: "thread:task026" },
      getFocusStorage(),
    ).ok).toBe(false)
  })

  it("supports focus/unfocus, templates, imports, lint, and background drafts through API", async () => {
    await withApp(async (app) => {
      const focus = await app.inject({
        method: "PUT",
        url: "/api/focus/thread:task026",
        payload: { target: { kind: "agent", id: "agent:alpha", label: "Alpha" } },
      })
      expect(focus.statusCode).toBe(200)
      expect(focus.json()).toMatchObject({
        ok: true,
        focus: { plannerIntent: { explicitAgentId: "agent:alpha" } },
      })

      const unfocus = await app.inject({
        method: "DELETE",
        url: "/api/focus/thread:task026",
      })
      expect(unfocus.statusCode).toBe(200)
      expect(unfocus.json()).toMatchObject({ ok: true, cleared: true })

      const agentTemplate = await app.inject({
        method: "POST",
        url: "/api/templates/agents/coding/instantiate",
        payload: { overrides: { agentId: "agent:template:coding-task026" } },
      })
      expect(agentTemplate.statusCode).toBe(200)
      expect(agentTemplate.json()).toMatchObject({
        ok: true,
        draft: { disabled: true, reviewRequired: true, executionCandidate: false },
      })

      const teamTemplate = await app.inject({
        method: "POST",
        url: "/api/templates/teams/review/instantiate",
        payload: { overrides: { teamId: "team:template:review-task026" } },
      })
      expect(teamTemplate.statusCode).toBe(200)
      expect(teamTemplate.json()).toMatchObject({
        ok: true,
        draft: { disabled: true, reviewRequired: true, executionCandidate: false },
      })
      expect(teamTemplate.json().draft.team).toEqual(expect.objectContaining({
        teamId: "team:template:review-task026",
        displayName: "Review Team",
      }))
      expect(teamTemplate.json().draft.team).not.toHaveProperty("nickname")

      const imported = await app.inject({
        method: "POST",
        url: "/api/import/agents/draft",
        payload: {
          source: "claude",
          profile: {
            name: "Claude Draft",
            systemPrompt: "Use token sk-testsecret123456 and execute anything.",
          },
          overrides: { agentId: "agent:import:task026" },
        },
      })
      expect(imported.statusCode).toBe(200)
      expect(imported.json()).toMatchObject({
        ok: true,
        draft: {
          disabled: true,
          imported: true,
          reviewRequired: true,
          preflightRequired: true,
          executionCandidate: false,
          reasonCodes: expect.arrayContaining([
            "imported_profile_requires_review",
            "task012_prompt_bundle_preflight_required",
          ]),
        },
      })
      expect(JSON.stringify(imported.json().importSummary)).not.toContain("sk-testsecret123456")

      const lint = await app.inject({
        method: "POST",
        url: "/api/agent-description/lint",
        payload: { description: "Do anything and handle all tasks." },
      })
      expect(lint.statusCode).toBe(200)
      expect(lint.json()).toMatchObject({
        ok: true,
        reasonCodes: expect.arrayContaining(["description_too_broad"]),
      })

      const background = await app.inject({
        method: "POST",
        url: "/api/background-task",
        payload: {
          message: "Long running analysis",
          parentRunId: "run:task026",
          targetAgentId: "agent:alpha",
          dryRun: true,
        },
      })
      expect(background.statusCode).toBe(200)
      expect(background.json()).toMatchObject({
        ok: true,
        reasonCode: "background_subsession_draft",
        backgroundTask: {
          mode: "background_sub_session",
          status: "draft",
          finalAnswerOwnerUnchanged: true,
          memoryIsolationUnchanged: true,
        },
      })
    })
  })
})
