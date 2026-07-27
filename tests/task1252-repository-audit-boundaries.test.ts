import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1252 repository artifact audit boundaries", () => {
  it("requires retention and UI boundaries in the production artifact audit", () => {
    const source = readFileSync("scripts/audit-repository-artifacts.mjs", "utf8")
    expect(source).toContain('"retention"')
    expect(source).toContain('"ui"')
    expect(source).toContain("retentionRecords")
    expect(source).toContain("uiRecords")
    expect(source).toContain("inventoryComplete: inventory.complete")
    expect(source).toContain("scansComplete")
    expect(source).toContain("decideRepositoryArtifactAuditCompletion")
  })

  it("keeps all eight reference boundaries aligned between the domain and production index", () => {
    const inventory = readFileSync("packages/core/src/maintenance/artifact-inventory.ts", "utf8")
    const index = readFileSync(
      "packages/core/src/maintenance/repository-reference-index.ts",
      "utf8",
    )
    for (const boundary of [
      "runtime",
      "test",
      "registry",
      "migration",
      "deployment",
      "build",
      "retention",
      "ui",
    ]) {
      expect(inventory).toContain(`"${boundary}"`)
      expect(index).toContain(`"${boundary}"`)
    }
  })
})
