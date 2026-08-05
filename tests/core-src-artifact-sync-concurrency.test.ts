import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("core source artifact sync concurrency", () => {
  it("uses a process-isolated temporary output directory", () => {
    const source = readFileSync("scripts/self/sync-core-src-artifacts.mjs", "utf8")

    expect(source).toContain("mkdtempSync(")
    expect(source).not.toContain(
      'const outputDir = join(coreDir, ".artifact-consistency-sync")',
    )
  })
})
