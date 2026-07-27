import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { buildMigrationPreflightReport } from "../packages/core/src/config/backup-rehearsal.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import {
  buildReleaseManifest,
  evaluateReleaseReadiness,
} from "../packages/core/src/release/package.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function runtimeFixture() {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task187-migration-"))
  tempDirs.push(rootDir)
  const fixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(fixture.paths.stateDir)
  return { rootDir, fixture }
}

describe("Task 187 up-to-date migration preflight", () => {
  it("does not require a migration backup when the database is already current", () => {
    const { fixture } = runtimeFixture()

    const report = buildMigrationPreflightReport({
      dbPath: fixture.paths.dbFile,
      canWrite: true,
      providerConfigSane: true,
    })

    expect(report).toMatchObject({
      ok: true,
      pendingVersions: [],
    })
    expect(report.risk).not.toBe("blocking")
    expect(report.checks.find((check) => check.name === "backup_available")).toMatchObject({
      ok: true,
      risk: "low",
    })
  })

  it("keeps a missing backup blocking when migrations are pending", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task187-pending-"))
    tempDirs.push(rootDir)

    const report = buildMigrationPreflightReport({
      dbPath: join(rootDir, "missing.db"),
      canWrite: true,
      providerConfigSane: true,
    })

    expect(report.pendingVersions.length).toBeGreaterThan(0)
    expect(report.checks.find((check) => check.name === "backup_available")).toMatchObject({
      ok: false,
      risk: "blocking",
    })
    expect(report.ok).toBe(false)
  })

  it("removes only the migration blocker from an up-to-date release manifest", () => {
    const { rootDir, fixture } = runtimeFixture()
    const manifest = buildReleaseManifest({
      rootDir,
      runtimePaths: fixture.paths,
      targetPlatforms: [],
      now: new Date("2026-07-17T00:00:00.000Z"),
    })

    expect(manifest.migrationPreflight).toMatchObject({ ok: true, pendingVersions: [] })
    expect(evaluateReleaseReadiness(manifest).blockerCodes).not.toContain(
      "migration_preflight_failed",
    )
    expect(evaluateReleaseReadiness(manifest).status).toBe("blocked")
  })
})
