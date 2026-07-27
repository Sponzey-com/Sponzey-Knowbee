import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const coreRuntimeFiles = [
  "packages/core/src/orchestration/mode.ts",
  "packages/core/src/orchestration/planner.ts",
  "packages/core/src/topology/executor-task-analysis.ts",
  "packages/core/src/topology/executor-delegation-resolution.ts",
  "packages/core/src/runs/runtime-inspector-projection.ts",
]

describe("task0998 core root-agent fallback name source", () => {
  it("uses the central Korean default main-agent name instead of local string fallbacks", () => {
    for (const filePath of coreRuntimeFiles) {
      const source = readFileSync(filePath, "utf-8")

      expect(source, filePath).toContain("DEFAULT_MAIN_AGENT_NAME_KO")
      expect(source, filePath).not.toMatch(/\|\|\s*"노비"/u)
      expect(source, filePath).not.toMatch(/\?\?\s*"노비"/u)
    }
  })
})
