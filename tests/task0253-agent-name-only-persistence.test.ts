import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerAgentRoutes } from "../packages/core/src/api/routes/agent.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import {
  AgentNameNamespaceError,
  closeDb,
  getAgentConfig,
  upsertAgentConfig,
} from "../packages/core/src/db/index.js"
import {
  CONTRACT_SCHEMA_VERSION,
  type MemoryPolicy,
  type PermissionProfile,
  type SkillMcpAllowlist,
  type SubAgentConfig,
} from "../packages/core/src/index.ts"
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

const tempDirs: string[] = []
let runtimeFixture: TestRuntimeConfigFixture
const now = Date.UTC(2026, 6, 5, 0, 0, 0)

const permissionProfile: PermissionProfile = {
  profileId: "profile:task0253",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: false,
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

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0253-agent-name-only-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function memoryPolicy(agentId: string): MemoryPolicy {
  const owner = { ownerType: "sub_agent" as const, ownerId: agentId }
  return {
    owner,
    visibility: "private",
    readScopes: [owner],
    writeScope: owner,
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function subAgent(agentId: string, agentName: string): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName,
    status: "enabled",
    role: "worker",
    personality: "Brief and precise.",
    specialtyTags: ["general"],
    avoidTasks: [],
    memoryPolicy: memoryPolicy(agentId),
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

describe("task0253 agentName-only persistence", () => {
  it("persists agentName-only configs without requiring legacy name fields in config_json", () => {
    upsertAgentConfig(subAgent("agent:field-summary", "현장 정리 담당"), { now })

    const row = getAgentConfig("agent:field-summary")
    const persisted = JSON.parse(row?.config_json ?? "{}") as Record<string, unknown>

    expect(row).toMatchObject({
      agent_name: "현장 정리 담당",
      normalized_agent_name: "현장 정리 담당",
    })
    expect(row).not.toHaveProperty("display_name")
    expect(row).not.toHaveProperty("nickname")
    expect(row).not.toHaveProperty("normalized_nickname")
    expect(persisted.agentName).toBe("현장 정리 담당")
    expect(persisted).not.toHaveProperty("displayName")
    expect(persisted).not.toHaveProperty("nickname")
    expect(persisted).not.toHaveProperty("normalizedNickname")
  })

  it("blocks duplicate user-facing agent names through the compatibility namespace", () => {
    upsertAgentConfig(subAgent("agent:first", "검토 담당"), { now })

    expect(() => upsertAgentConfig(subAgent("agent:second", " 검토   담당 "), { now })).toThrow(
      AgentNameNamespaceError,
    )
  })

  it("strips legacy name fields from direct upsert config_json", () => {
    upsertAgentConfig({
      ...subAgent("agent:legacy-direct", "정식 이름"),
      displayName: "Legacy Display",
      nickname: "Legacy Nick",
      normalizedNickname: "legacy nick",
    }, { now })

    const row = getAgentConfig("agent:legacy-direct")
    const persisted = JSON.parse(row?.config_json ?? "{}") as Record<string, unknown>

    expect(row).toMatchObject({
      agent_name: "정식 이름",
      normalized_agent_name: "정식 이름",
    })
    expect(row).not.toHaveProperty("display_name")
    expect(row).not.toHaveProperty("nickname")
    expect(row).not.toHaveProperty("normalized_nickname")
    expect(persisted.agentName).toBe("정식 이름")
    expect(persisted).not.toHaveProperty("displayName")
    expect(persisted).not.toHaveProperty("nickname")
    expect(persisted).not.toHaveProperty("normalizedNickname")
  })

  it("removes legacy name fields from config_json when PATCH updates agentName", async () => {
    const app = Fastify({ logger: false })
    installApiRuntimeConfig(app as never, runtimeFixture.config, runtimeFixture.paths)
    registerAgentRoutes(app)
    await app.ready()
    try {
      upsertAgentConfig({
        ...subAgent("agent:legacy-patch", "기존 이름"),
        displayName: "Legacy Display",
        nickname: "Legacy Nick",
        normalizedNickname: "legacy nick",
      }, { now })

      const response = await app.inject({
        method: "PATCH",
        url: "/api/agents/agent%3Alegacy-patch",
        payload: {
          agent: {
            agentName: "새 이름",
          },
        },
      })

      expect(response.statusCode).toBe(200)
      const row = getAgentConfig("agent:legacy-patch")
      const persisted = JSON.parse(row?.config_json ?? "{}") as Record<string, unknown>

      expect(row).toMatchObject({
        agent_name: "새 이름",
        normalized_agent_name: "새 이름",
      })
      expect(row).not.toHaveProperty("display_name")
      expect(row).not.toHaveProperty("nickname")
      expect(row).not.toHaveProperty("normalized_nickname")
      expect(persisted.agentName).toBe("새 이름")
      expect(persisted).not.toHaveProperty("displayName")
      expect(persisted).not.toHaveProperty("nickname")
      expect(persisted).not.toHaveProperty("normalizedNickname")
    } finally {
      await app.close()
    }
  })
})
