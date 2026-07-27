import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1148 settings and channels configuration command boundary", () => {
  it("removes config singleton reads and reloads from settings and channels routes", () => {
    for (const path of [
      "packages/core/src/api/routes/settings.ts",
      "packages/core/src/api/routes/channels.ts",
    ]) {
      const source = readFileSync(path, "utf-8")
      expect(source).not.toContain("getConfig()")
      expect(source).not.toContain("reloadConfig()")
      expect(source).not.toMatch(/import \{[^}]*\b(?:getConfig|reloadConfig)\b[^}]*\} from/)
      expect(source).toContain("getApiRuntimeConfig")
    }
  })

  it("makes persisted settings application timing explicit", () => {
    const source = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    expect(source).toContain('restartRequired: true')
    expect(source).toContain('appliesOn: "next_start"')
    expect(source).toContain('error: "runtime_config_reload_not_supported"')
  })

  it("passes an explicit config snapshot into channel restart", () => {
    const source = readFileSync("packages/core/src/api/routes/channels.ts", "utf-8")
    expect(source).toContain("async function restartConnection(")
    expect(source).toContain("config: KnowbeeConfig")
    expect(source).not.toContain("const cfg = reloadConfig()")
  })
})
