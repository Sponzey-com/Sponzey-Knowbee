import { createRequire } from "node:module"
import { describe, expect, it } from "vitest"
import type { DbAgentCapabilityKind } from "../packages/core/src/db/index.js"
import { MIGRATIONS } from "../packages/core/src/db/migrations.js"

interface TestDatabase {
  exec(sql: string): void
  prepare(sql: string): {
    run(...args: unknown[]): unknown
    all(...args: unknown[]): unknown[]
  }
  transaction<T extends (...args: never[]) => unknown>(fn: T): T
  close(): void
}

const require = createRequire(import.meta.url)
const BetterSqlite3 = require("../packages/core/node_modules/better-sqlite3") as new (
  path: string,
) => TestDatabase

function insertBinding(db: TestDatabase, kind: DbAgentCapabilityKind, suffix: string): void {
  db.prepare(
    `INSERT INTO agent_capability_bindings
      (binding_id, agent_id, capability_kind, catalog_id, status, enabled_tool_names_json,
       disabled_tool_names_json, schema_version, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enabled', '[]', '[]', 1, 'manual', 1, 1)`,
  ).run(`binding:${suffix}`, `agent:${suffix}`, kind, `catalog:${suffix}`)
}

describe("task035 Yeonjang binding migration", () => {
  it("preserves Skill and MCP rows while adding Yeonjang to the single binding owner", () => {
    const db = new BetterSqlite3(":memory:")
    try {
      const createBindingTable = MIGRATIONS.find((migration) => migration.version === 37)
      const extendBindingTable = MIGRATIONS.find((migration) => migration.version === 64)
      if (!createBindingTable || !extendBindingTable) throw new Error("binding_migration_missing")
      createBindingTable.up(db as never)
      insertBinding(db, "skill", "skill")
      insertBinding(db, "mcp_server", "mcp")
      db.transaction(() => extendBindingTable.up(db as never))()
      insertBinding(db, "yeonjang", "yeonjang")

      const rows = db
        .prepare(
          "SELECT binding_id, capability_kind FROM agent_capability_bindings ORDER BY binding_id",
        )
        .all() as Array<{ binding_id: string; capability_kind: string }>
      expect(rows).toEqual([
        { binding_id: "binding:mcp", capability_kind: "mcp_server" },
        { binding_id: "binding:skill", capability_kind: "skill" },
        { binding_id: "binding:yeonjang", capability_kind: "yeonjang" },
      ])
      expect(() => insertBinding(db, "yeonjang", "yeonjang")).toThrow()
      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ?")
        .all("agent_capability_bindings") as Array<{ name: string }>
      expect(indexes.map((item) => item.name)).toEqual(
        expect.arrayContaining([
          "idx_agent_capability_bindings_agent",
          "idx_agent_capability_bindings_catalog",
          "idx_agent_capability_bindings_audit",
        ]),
      )
    } finally {
      db.close()
    }
  })
})
