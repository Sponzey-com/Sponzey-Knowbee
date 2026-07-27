import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1101 bootstrap runtime manifest config", () => {
  it("threads the bootstrap config snapshot into the initial runtime manifest refresh", () => {
    const bootstrapSource = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf-8")

    expect(bootstrapSource).toContain("const startupConfigSource = createStartupConfigSource(() => {")
    expect(bootstrapSource).toContain("loadConfigSnapshot({")
    expect(bootstrapSource).not.toContain("getConfig")
    expect(bootstrapSource).toContain("const runtimeConfig = resolveBootstrapConfig(config)")
    expect(bootstrapSource).toContain("processCwd: processContext.cwd")
    expect(bootstrapSource).not.toContain("refreshRuntimeManifest({ includeEnvironment: false, includeReleasePackage: false })")
  })
})
