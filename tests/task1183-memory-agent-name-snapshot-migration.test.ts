import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { closeDb, getDb } from "../packages/core/src/db/index.js"
import { MIGRATIONS, runMigrations } from "../packages/core/src/db/migrations.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

type SqliteStatement = {
  run(...args: unknown[]): unknown
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown
}

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  close(): void
}

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as new (path: string) => SqliteDatabase
const roots: string[] = []

function columns(db: SqliteDatabase, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
}

function migrateThrough(db: SqliteDatabase, version: number): void {
  db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)")
  for (const migration of MIGRATIONS.filter((item) => item.version <= version)) {
    const apply = () => {
      migration.up(db as never)
      db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(migration.version, migration.version)
    }
    if (migration.transaction === false) apply()
    else db.transaction(apply)()
  }
}

function insertV51MemoryFixture(db: SqliteDatabase): void {
  db.prepare(`
    INSERT INTO memory_capsules
      (capsule_id, capsule_version, parent_capsule_id, owner_type, owner_id, session_id,
       request_group_id, lineage_id, channel_key, thread_key, nickname_snapshot, capsule_kind,
       summary, active_objectives_json, confirmed_facts_json, decisions_json, constraints_json,
       pending_items_json, artifact_refs_json, recovery_hints_json, source_refs_json,
       compacted_message_ids_json, source_token_estimate, result_token_estimate, metadata_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "capsule:legacy", 1, null, "sub_agent", "agent:research", "session:1",
    "request-group:1", "lineage:1", "telegram", "thread:1", "Researcher at compaction",
    "session_compaction", "Historical summary", "[]", "[]", "[]", "[]", "[]", "[]",
    "[]", "[\"message:1\"]", "[\"message:1\"]", 1200, 240, null, 100,
  )
  db.prepare(`
    INSERT INTO agent_memory_state
      (state_id, owner_scope_key, agent_type, agent_id, session_id, request_group_id,
       lineage_id, channel_key, thread_key, nickname_snapshot, latest_capsule_id,
       current_raw_token_estimate, current_raw_message_count, last_compaction_at,
       compaction_block_reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "state:legacy", "sub_agent:agent:research:session:1", "sub_agent", "agent:research",
    "session:1", "request-group:1", "lineage:1", "telegram", "thread:1",
    "Researcher at compaction", "capsule:legacy", 200, 3, 100, null, 90, 110,
  )
}

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task1183-"))
  roots.push(root)
  initializeTestDbRuntime(createTestRuntimeConfigFixture({ rootDir: root }).paths.stateDir)
})

afterEach(() => {
  closeDb()
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1183 memory agent-name snapshot migration", () => {
  it("uses only canonical memory agent-name snapshot columns on a fresh database", () => {
    const db = getDb() as unknown as SqliteDatabase
    expect(columns(db, "memory_capsules")).toContain("agent_name_snapshot")
    expect(columns(db, "memory_capsules")).not.toContain("nickname_snapshot")
    expect(columns(db, "agent_memory_state")).toContain("agent_name_snapshot")
    expect(columns(db, "agent_memory_state")).not.toContain("nickname_snapshot")
  })

  it("preserves v51 capsule attribution, ownership, lineage, and memory state", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 51)
      insertV51MemoryFixture(db)
      runMigrations(db as never)

      expect(db.prepare(`
        SELECT owner_type, owner_id, session_id, lineage_id, agent_name_snapshot, summary,
               source_token_estimate, result_token_estimate
        FROM memory_capsules WHERE capsule_id = ?
      `).get("capsule:legacy")).toEqual({
        owner_type: "sub_agent",
        owner_id: "agent:research",
        session_id: "session:1",
        lineage_id: "lineage:1",
        agent_name_snapshot: "Researcher at compaction",
        summary: "Historical summary",
        source_token_estimate: 1200,
        result_token_estimate: 240,
      })
      expect(db.prepare(`
        SELECT owner_scope_key, agent_type, agent_id, session_id, agent_name_snapshot,
               latest_capsule_id, current_raw_token_estimate, current_raw_message_count
        FROM agent_memory_state WHERE state_id = ?
      `).get("state:legacy")).toEqual({
        owner_scope_key: "sub_agent:agent:research:session:1",
        agent_type: "sub_agent",
        agent_id: "agent:research",
        session_id: "session:1",
        agent_name_snapshot: "Researcher at compaction",
        latest_capsule_id: "capsule:legacy",
        current_raw_token_estimate: 200,
        current_raw_message_count: 3,
      })
    } finally {
      db.close()
    }
  })

  it("rolls back both canonical renames when the second source column is missing", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 51)
      db.exec("ALTER TABLE agent_memory_state DROP COLUMN nickname_snapshot")

      expect(() => runMigrations(db as never)).toThrow()
      const latest = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }
      expect(latest.version).toBe(51)
      expect(columns(db, "memory_capsules")).toContain("nickname_snapshot")
      expect(columns(db, "memory_capsules")).not.toContain("agent_name_snapshot")
      expect(columns(db, "agent_memory_state")).not.toContain("agent_name_snapshot")
    } finally {
      db.close()
    }
  })

  it("keeps legacy memory snapshot writes inside the migration boundary", () => {
    const repositorySource = readFileSync("packages/core/src/db/index.ts", "utf8")
    expect(repositorySource).not.toMatch(/nickname_snapshot AS agent_name_snapshot/)
    expect(repositorySource).not.toMatch(/thread_key, nickname_snapshot, capsule_kind/)
    expect(repositorySource).not.toMatch(/thread_key, nickname_snapshot, latest_capsule_id/)
    expect(repositorySource).not.toMatch(/nickname_snapshot = COALESCE/)
  })
})
