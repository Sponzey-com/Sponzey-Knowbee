import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = process.cwd()

describe("task0250 sidekick prompt-memory artifact removal", () => {
  it("does not keep the stale sidekick-md compatibility exception", () => {
    const syncScript = readFileSync(join(repoRoot, "scripts/sync-core-src-artifacts.mjs"), "utf-8")
    const consistencyTest = readFileSync(join(repoRoot, "tests/generated-artifact-consistency.test.ts"), "utf-8")

    expect(syncScript).not.toContain("memory/sidekick-md")
    expect(consistencyTest).not.toContain("memory/sidekick-md")
  })

  it("does not ship orphan sidekick-md generated source artifacts", () => {
    for (const suffix of [".js", ".js.map", ".d.ts", ".d.ts.map"]) {
      expect(existsSync(join(repoRoot, "packages/core/src/memory", `sidekick-md${suffix}`))).toBe(false)
    }
  })
})
