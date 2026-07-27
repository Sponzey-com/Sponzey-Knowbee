import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1144 execution API config context", () => {
  it("removes request-time singleton reads from execution routes", () => {
    for (const path of [
      "packages/core/src/api/routes/runs.ts",
      "packages/core/src/api/routes/scheduler.ts",
      "packages/core/src/api/routes/schedules.ts",
    ]) {
      const source = readFileSync(path, "utf-8")
      expect(source).not.toContain("getConfig()")
      expect(source).toContain("getApiRuntimeConfig")
    }
  })

  it("requires startLocalRun callers to pass the request snapshot", () => {
    const source = readFileSync("packages/core/src/api/routes/runs.ts", "utf-8")
    expect(source).toContain("config: KnowbeeConfig")
    expect(source).toContain("const runtimeConfig = params.config")
    expect(source).toContain("config: runtimeConfig")
  })
})
