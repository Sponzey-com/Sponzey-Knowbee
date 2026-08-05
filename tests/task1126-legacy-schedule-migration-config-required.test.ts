import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1126 legacy schedule migration config boundary", () => {
  it("requires legacy schedule migration helpers to receive explicit config snapshots", () => {
    const migrationSource = readFileSync("packages/core/src/schedules/legacy-migration.ts", "utf-8")
    const legacyMigrationTestSource = readFileSync("tests/task009-legacy-schedule-migration.test.ts", "utf-8")

    expect(migrationSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(migrationSource).toContain("config: KnowbeeConfig,\n): LegacyScheduleMigrationReport")
    expect(migrationSource).toContain("options: { audit?: boolean; config: KnowbeeConfig }")
    expect(migrationSource).toContain("options: { config: KnowbeeConfig }")
    expect(migrationSource).toContain("export function listLegacyScheduleMigrationItems(config: KnowbeeConfig): LegacyScheduleMigrationItem[]")
    expect(migrationSource).not.toContain("config: KnowbeeConfig = getConfig()")
    expect(legacyMigrationTestSource).toContain("listLegacyScheduleMigrationItems(config)")
    expect(legacyMigrationTestSource).toContain("dryRunLegacyScheduleMigration(\"schedule-task009-dry-run\", { config })")
    expect(legacyMigrationTestSource).toContain("applyLegacyScheduleMigration(\"schedule-task009-convert\", { config })")
  })
})
