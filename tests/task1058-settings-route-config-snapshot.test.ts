import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1058 settings route config snapshot", () => {
  it("reuses settings route config snapshots instead of reading config subpaths repeatedly", () => {
    const source = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")

    for (const forbidden of [
      "getConfig().telegram",
      "getConfig().slack",
      "getConfig().discord",
      "getConfig().googleChat",
      "getConfig().ai",
      "getConfig().memory",
    ]) {
      expect(source).not.toContain(forbidden)
    }

    expect(source).toContain("const currentConfig = getApiRuntimeConfig(req)")
    expect(source).toContain("currentConfig.telegram?.botToken")
    expect(source).toContain("currentConfig.slack?.botToken")
    expect(source).toContain("currentConfig.discord?.publicKey")
    expect(source).toContain("currentConfig.googleChat?.verificationToken")
    expect(source).toContain("const providerCapability = getProviderCapabilityMatrix({ connection, memory: cfg.memory })")
  })
})
