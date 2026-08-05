import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import { MIGRATIONS, runMigrations } from "../packages/core/src/db/migrations.ts"

type Statement = {
  run(...args: unknown[]): unknown
  get(...args: unknown[]): unknown
  all(...args: unknown[]): unknown
}

type SqliteDatabase = {
  exec(sql: string): void
  prepare(sql: string): Statement
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  close(): void
}

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as new (path: string) => SqliteDatabase

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

function insertLegacyTeam(db: SqliteDatabase, input: {
  teamId: string
  displayName: string
  nickname?: string
  status?: "enabled" | "disabled" | "archived"
}): void {
  const status = input.status ?? "enabled"
  const config = {
    schemaVersion: 1,
    teamId: input.teamId,
    displayName: input.displayName,
    nickname: input.nickname ?? input.displayName,
    normalizedNickname: (input.nickname ?? input.displayName).toLowerCase(),
    status,
    purpose: "Historical team fixture",
    roleHints: [],
    memberAgentIds: [],
    profileVersion: 3,
    createdAt: 100,
    updatedAt: 200,
  }
  db.prepare(`
    INSERT INTO team_configs
      (team_id, status, display_name, nickname, purpose, role_hints_json,
       member_agent_ids_json, profile_version, config_json, schema_version, source,
       created_at, updated_at, archived_at, normalized_nickname)
    VALUES (?, ?, ?, ?, ?, '[]', '[]', 3, ?, 1, 'import', 100, 200, ?, ?)
  `).run(
    input.teamId,
    status,
    input.displayName,
    input.nickname ?? input.displayName,
    "Historical team fixture",
    JSON.stringify(config),
    status === "archived" ? 200 : null,
    (input.nickname ?? input.displayName).toLowerCase(),
  )
}

function insertLegacyPlan(db: SqliteDatabase): void {
  db.prepare(`
    INSERT INTO team_execution_plans
      (team_execution_plan_id, parent_run_id, team_id, team_nickname_snapshot,
       owner_agent_id, lead_agent_id, member_task_assignments_json,
       reviewer_agent_ids_json, verifier_agent_ids_json, fallback_assignments_json,
       coverage_report_json, conflict_policy_snapshot, result_policy_snapshot,
       contract_json, schema_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, '[]', '[]', '[]', '[]', '{}', ?, ?, ?, 1, 150)
  `).run(
    "team-plan:legacy",
    "run:legacy",
    "team:legacy",
    "Historical Team Name",
    "agent:knowbee",
    "agent:knowbee",
    "owner_decides",
    "owner_synthesis",
    JSON.stringify({
      teamExecutionPlanId: "team-plan:legacy",
      teamId: "team:legacy",
      teamAgentNameSnapshot: "Historical Team Name",
    }),
  )
}

describe("task1184 canonical team naming storage migration", () => {
  it("preserves team state and historical plan names while removing legacy columns", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 52)
      insertLegacyTeam(db, {
        teamId: "team:legacy",
        displayName: "Canonical Team",
        nickname: "Old Team Alias",
        status: "archived",
      })
      insertLegacyPlan(db)

      runMigrations(db as never)

      expect(columns(db, "team_configs")).toContain("display_name")
      expect(columns(db, "team_configs")).not.toContain("nickname")
      expect(columns(db, "team_configs")).not.toContain("normalized_nickname")
      expect(columns(db, "team_execution_plans")).toContain("team_name_snapshot")
      expect(columns(db, "team_execution_plans")).not.toContain("team_nickname_snapshot")

      const team = db.prepare(`
        SELECT status, display_name, purpose, profile_version, config_json, archived_at
        FROM team_configs WHERE team_id = ?
      `).get("team:legacy") as Record<string, unknown>
      expect(team).toMatchObject({
        status: "archived",
        display_name: "Canonical Team",
        purpose: "Historical team fixture",
        profile_version: 3,
        archived_at: 200,
      })
      expect(JSON.parse(String(team.config_json))).toMatchObject({
        teamId: "team:legacy",
        displayName: "Canonical Team",
      })
      expect(JSON.parse(String(team.config_json))).not.toHaveProperty("nickname")
      expect(JSON.parse(String(team.config_json))).not.toHaveProperty("normalizedNickname")

      const plan = db.prepare(`
        SELECT team_name_snapshot, contract_json FROM team_execution_plans
        WHERE team_execution_plan_id = ?
      `).get("team-plan:legacy") as { team_name_snapshot: string; contract_json: string }
      expect(plan.team_name_snapshot).toBe("Historical Team Name")
      expect(JSON.parse(plan.contract_json)).toMatchObject({ teamNameSnapshot: "Historical Team Name" })
      expect(JSON.parse(plan.contract_json)).not.toHaveProperty("teamAgentNameSnapshot")
    } finally {
      db.close()
    }
  })

  it("rejects duplicate canonical team names before changing the schema", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 52)
      insertLegacyTeam(db, { teamId: "team:first", displayName: "Same Team" })
      insertLegacyTeam(db, { teamId: "team:second", displayName: "  same   team  " })

      expect(() => runMigrations(db as never)).toThrow(/conflicts with team team:first/)
      expect((db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version).toBe(52)
      expect(columns(db, "team_configs")).toContain("nickname")
      expect(columns(db, "team_configs")).toContain("normalized_nickname")
    } finally {
      db.close()
    }
  })

  it("rolls back the team rebuild when the plan snapshot rename fails", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      migrateThrough(db, 52)
      insertLegacyTeam(db, { teamId: "team:legacy", displayName: "Canonical Team" })
      db.exec("ALTER TABLE team_execution_plans DROP COLUMN team_nickname_snapshot")

      expect(() => runMigrations(db as never)).toThrow()
      expect((db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version).toBe(52)
      expect(columns(db, "team_configs")).toContain("nickname")
      expect(columns(db, "team_configs")).toContain("normalized_nickname")
      expect(db.prepare("SELECT display_name FROM team_configs WHERE team_id = ?").get("team:legacy")).toEqual({
        display_name: "Canonical Team",
      })
    } finally {
      db.close()
    }
  })
})
