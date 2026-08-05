import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  AgentNameNamespaceError,
  closeDb,
  getAgentConfig,
  getDb,
  upsertAgentConfig,
} from "../packages/core/src/db/index.js"
import { CONTRACT_SCHEMA_VERSION, type SubAgentConfig } from "../packages/core/src/index.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { MIGRATIONS, runMigrations } from "../packages/core/src/db/migrations.ts"

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown }
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  close(): void
}

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as new (path: string) => SqliteDatabase

const roots: string[] = []

function config(agentId: string, agentName: string): SubAgentConfig {
  const owner = { ownerType: "sub_agent" as const, ownerId: agentId }
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    agentName,
    status: "enabled",
    role: "worker",
    personality: "Precise",
    specialtyTags: [],
    avoidTasks: [],
    memoryPolicy: {
      owner,
      visibility: "private",
      readScopes: [owner],
      writeScope: owner,
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: {
        profileId: "profile:test",
        riskCeiling: "moderate",
        approvalRequiredFrom: "moderate",
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
    delegation: { enabled: false, maxParallelSessions: 1 },
    teamIds: [],
    profileVersion: 1,
    createdAt: 1_783_900_000_000,
    updatedAt: 1_783_900_000_000,
  }
}

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task1180-"))
  roots.push(root)
  const runtime = createTestRuntimeConfigFixture({ rootDir: root })
  initializeTestDbRuntime(runtime.paths.stateDir)
})

afterEach(() => {
  closeDb()
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1180 agent name persistence migration", () => {
  it("uses only canonical agent-name columns on a fresh database", () => {
    const db = getDb()
    const columns = (db.prepare("PRAGMA table_info(agent_configs)").all() as Array<{ name: string }>).map((row) => row.name)
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name)

    expect(columns).toEqual(expect.arrayContaining(["agent_name", "normalized_agent_name"]))
    expect(columns).not.toEqual(expect.arrayContaining(["display_name", "nickname", "normalized_nickname"]))
    expect(tables).toContain("agent_name_namespaces")
    expect(tables).not.toContain("nickname_namespaces")
  })

  it("persists and reads canonical names without legacy storage fields", () => {
    upsertAgentConfig(config("agent:research", " Research   Lead "))
    const row = getAgentConfig("agent:research")

    expect(row).toMatchObject({
      agent_name: "Research Lead",
      normalized_agent_name: "research lead",
    })
    expect(row).not.toHaveProperty("display_name")
    expect(row).not.toHaveProperty("nickname")
    expect(row).not.toHaveProperty("normalized_nickname")
  })

  it("reports duplicate canonical names with the canonical error contract", () => {
    upsertAgentConfig(config("agent:first", "Review Lead"))

    expect(() => upsertAgentConfig(config("agent:second", " review   lead "))).toThrow(AgentNameNamespaceError)
  })

  it("keeps the v49 schema intact when canonical name validation fails before swap", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)")
      for (const migration of MIGRATIONS.filter((item) => item.version <= 49)) {
        const apply = () => {
          migration.up(db as never)
          db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, migration.version)
        }
        if (migration.transaction === false) apply()
        else db.transaction(apply)()
      }

      db.prepare(`
        INSERT INTO agent_configs
          (agent_id, agent_type, status, display_name, nickname, normalized_nickname, role, personality,
           specialty_tags_json, avoid_tasks_json, model_profile_json, memory_policy_json, capability_policy_json,
           delegation_policy_json, profile_version, config_json, schema_version, source, audit_id, idempotency_key,
           created_at, updated_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "agent:invalid",
        "sub_agent",
        "disabled",
        "",
        null,
        null,
        "worker",
        "legacy invalid fixture",
        "[]",
        "[]",
        null,
        "{}",
        "{}",
        null,
        1,
        "{}",
        CONTRACT_SCHEMA_VERSION,
        "import",
        null,
        null,
        1,
        1,
        null,
      )

      expect(() => runMigrations(db as never)).toThrow()
      const columns = (db.prepare("PRAGMA table_info(agent_configs)") as unknown as { all(): Array<{ name: string }> }).all().map((row) => row.name)
      const latest = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }

      expect(columns).toContain("display_name")
      expect(columns).not.toContain("agent_name")
      expect(latest.version).toBe(49)
    } finally {
      db.close()
    }
  })
})
