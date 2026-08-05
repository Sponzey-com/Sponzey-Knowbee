import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1147 setup and UI mode startup config boundary", () => {
  it("uses request config instead of the config singleton in setup and UI mode routes", () => {
    for (const path of [
      "packages/core/src/api/routes/setup.ts",
      "packages/core/src/api/routes/ui-mode.ts",
    ]) {
      const source = readFileSync(path, "utf-8")
      expect(source).not.toContain("getConfig()")
      expect(source).not.toMatch(/import \{[^}]*\bgetConfig\b[^}]*\} from/)
      expect(source).toContain("getApiRuntimeConfig")
    }
  })

  it("does not reload the process config after setup or UI preference writes", () => {
    const controlPlane = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const uiMode = readFileSync("packages/core/src/ui/mode.ts", "utf-8")

    expect(controlPlane).not.toContain("const reloadedConfig = reloadConfig()")
    expect(uiMode).not.toContain("reloadConfig()")
  })
})
