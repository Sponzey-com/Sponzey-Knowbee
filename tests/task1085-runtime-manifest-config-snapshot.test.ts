import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1085 runtime manifest config snapshot", () => {
  it("resolves runtime manifest config once and passes it to internal helpers", () => {
    const source = readFileSync("packages/core/src/runtime/manifest.ts", "utf-8")

    expect(source).toContain("import type { KnowbeeConfig } from \"../config/types.js\"")
    expect(source).toContain("config: KnowbeeConfig")
    expect(source).toContain("const config = options.config")
    expect(source).toContain("function readMemoryState(config: KnowbeeConfig, paths: RuntimePaths): RuntimeManifestMemory")
    expect(source).toContain("function buildProviderProfile(config: KnowbeeConfig): RuntimeManifestProviderProfile")
    expect(source).toContain("function buildChannels(config: KnowbeeConfig): RuntimeManifestChannelSummary")
    expect(source).toContain("provider: buildProviderProfile(config)")
    expect(source).toContain("channels: buildChannels(config)")
    expect(source).toContain("memory: readMemoryState(config, paths)")
    expect(source).toContain("cwd: options.processCwd ?? config.profile.workspace")
    expect(source).not.toContain("cwd: process.cwd()")

    expect(source).not.toContain("function readMemoryState(): RuntimeManifestMemory {\n  const cfg = getConfig()")
    expect(source).not.toContain("function buildProviderProfile(): RuntimeManifestProviderProfile {\n  const cfg = getConfig()")
    expect(source).not.toContain("function buildChannels(): RuntimeManifestChannelSummary {\n  const cfg = getConfig()")
    expect(source).not.toContain("options.config ?? getConfig()")
  })
})
