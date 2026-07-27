import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1107 scheduler health route config snapshot", () => {
  it("captures scheduler health config before calling scheduler", () => {
    const source = readFileSync("packages/core/src/api/routes/scheduler.ts", "utf-8")

    expect(source).toContain("const config = getApiRuntimeConfig(req)\n    return scheduler.getHealth(config)")
    expect(source).not.toContain("getConfig()")
  })
})
