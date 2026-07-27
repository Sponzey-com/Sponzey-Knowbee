import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const ROUTES = [
  "packages/core/src/api/routes/plugins.ts",
  "packages/core/src/api/routes/channel-smoke.ts",
  "packages/core/src/api/routes/admin.ts",
]

describe("task1146 diagnostics API config context", () => {
  it("does not read the config singleton while handling diagnostics requests", () => {
    for (const path of ROUTES) {
      const source = readFileSync(path, "utf-8")
      expect(source).not.toContain("getConfig()")
      expect(source).not.toMatch(/import \{[^}]*\bgetConfig\b[^}]*\} from/)
      expect(source).toContain("getApiRuntimeConfig")
    }
  })

  it("does not reload config from diagnostics routes", () => {
    for (const path of ROUTES) {
      expect(readFileSync(path, "utf-8")).not.toContain("reloadConfig")
    }
  })
})
