import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1087 legacy schedule migration config snapshot", () => {
  it("accepts explicit config snapshots for legacy schedule migration operations", () => {
    const migrationSource = readFileSync("packages/core/src/schedules/legacy-migration.ts", "utf-8")
    const routeSource = readFileSync("packages/core/src/api/routes/schedules.ts", "utf-8")

    expect(migrationSource).toContain("import type { KnowbeeConfig } from \"../config/types.js\"")
    expect(migrationSource).not.toContain("import { getConfig } from \"../config/index.js\"")
    expect(migrationSource).toContain("schedule: DbSchedule,\n  config: KnowbeeConfig,")
    expect(migrationSource).toContain("options: { audit?: boolean; config: KnowbeeConfig }")
    expect(migrationSource).toContain("options: { config: KnowbeeConfig }")
    expect(migrationSource).toContain("export function listLegacyScheduleMigrationItems(config: KnowbeeConfig): LegacyScheduleMigrationItem[]")
    expect(migrationSource).not.toContain("config: KnowbeeConfig = getConfig()")
    expect(migrationSource).not.toContain("const config = getConfig()\n  const timezone = normalizeScheduleTimezone")

    expect(routeSource).toContain("return { schedules: listLegacyScheduleMigrationItems(config) }")
    expect(routeSource).toContain("const report = dryRunLegacyScheduleMigration(req.params.id, { audit: true, config })")
    expect(routeSource).toContain("const result = applyLegacyScheduleMigration(req.params.id, { config })")
    expect(routeSource).toContain("const result = keepLegacySchedule(req.params.id, { config })")
  })
})
