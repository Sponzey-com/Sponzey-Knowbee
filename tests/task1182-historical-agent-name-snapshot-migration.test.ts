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

beforeEach(() => {
  closeDb()
  const root = mkdtempSync(join(tmpdir(), "knowbee-task1182-"))
  roots.push(root)
  const runtime = createTestRuntimeConfigFixture({ rootDir: root })
  initializeTestDbRuntime(runtime.paths.stateDir)
})

afterEach(() => {
  closeDb()
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe("task1182 historical agent-name snapshot migration", () => {
  it("uses only canonical agent-name snapshot columns on a fresh database", () => {
    const db = getDb() as unknown as SqliteDatabase

    expect(columns(db, "run_subsessions")).toEqual(expect.arrayContaining(["agent_name", "agent_name_snapshot"]))
    expect(columns(db, "run_subsessions")).not.toEqual(expect.arrayContaining(["agent_display_name", "agent_nickname"]))
    expect(columns(db, "agent_data_exchanges")).toEqual(expect.arrayContaining([
      "source_agent_name_snapshot",
      "recipient_agent_name_snapshot",
    ]))
    expect(columns(db, "agent_data_exchanges")).not.toEqual(expect.arrayContaining([
      "source_nickname_snapshot",
      "recipient_nickname_snapshot",
    ]))
  })

  it("preserves v50 historical names while replacing physical legacy columns", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 50)
      db.prepare(`
        INSERT INTO run_subsessions
          (sub_session_id, parent_run_id, parent_session_id, parent_request_id, agent_id,
           agent_display_name, agent_nickname, command_request_id, status, prompt_bundle_id,
           contract_json, schema_version, audit_id, idempotency_key, created_at, updated_at, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "sub-session:legacy", "run:root", "session:root", "request:root", "agent:research",
        "Research Agent", "Research Agent at dispatch", "command:1", "completed", "bundle:1",
        "{}", 1, null, "idempotency:sub-session:legacy", 10, 20, 11, 19,
      )
      db.prepare(`
        INSERT INTO agent_data_exchanges
          (exchange_id, source_owner_type, source_owner_id, source_nickname_snapshot,
           recipient_owner_type, recipient_owner_id, recipient_nickname_snapshot, purpose,
           allowed_use, retention_policy, redaction_state, provenance_refs_json, payload_json,
           contract_json, schema_version, audit_id, idempotency_key, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "exchange:legacy", "knowbee", "agent:main", "Main Agent at dispatch",
        "sub_agent", "agent:research", "Research Agent at dispatch", "verification",
        "verification_only", "session_only", "redacted", "[]", "{}", "{}", 1,
        null, "idempotency:exchange:legacy", 10, 20, null,
      )

      runMigrations(db as never)

      expect(columns(db, "run_subsessions")).not.toContain("agent_display_name")
      expect(columns(db, "agent_data_exchanges")).not.toContain("source_nickname_snapshot")
      expect(db.prepare("SELECT agent_name, agent_name_snapshot FROM run_subsessions").get()).toEqual({
        agent_name: "Research Agent",
        agent_name_snapshot: "Research Agent at dispatch",
      })
      expect(db.prepare("SELECT source_agent_name_snapshot, recipient_agent_name_snapshot FROM agent_data_exchanges").get()).toEqual({
        source_agent_name_snapshot: "Main Agent at dispatch",
        recipient_agent_name_snapshot: "Research Agent at dispatch",
      })
    } finally {
      db.close()
    }
  })

  it("rolls back v51 when the legacy source schema is malformed", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 50)
      db.exec("ALTER TABLE run_subsessions DROP COLUMN agent_display_name")

      expect(() => runMigrations(db as never)).toThrow()
      const latest = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }

      expect(latest.version).toBe(50)
      expect(columns(db, "run_subsessions")).toContain("agent_nickname")
      expect(columns(db, "run_subsessions")).not.toContain("agent_name")
      expect(columns(db, "agent_data_exchanges")).toContain("source_nickname_snapshot")
      expect(columns(db, "agent_data_exchanges")).not.toContain("source_agent_name_snapshot")
    } finally {
      db.close()
    }
  })

  it("keeps legacy historical agent-name writes inside the migration boundary", () => {
    const repositorySource = readFileSync("packages/core/src/db/index.ts", "utf8")
    const workspaceSource = readFileSync("packages/core/src/orchestration/command-workspace.ts", "utf8")

    for (const source of [repositorySource, workspaceSource]) {
      expect(source).not.toMatch(/agent_display_name|agent_nickname/)
      expect(source).not.toMatch(/source_nickname_snapshot|recipient_nickname_snapshot/)
    }
  })
})
