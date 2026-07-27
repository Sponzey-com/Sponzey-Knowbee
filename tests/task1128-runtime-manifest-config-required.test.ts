import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1128 runtime manifest config required", () => {
  it("requires an explicit config snapshot and has no singleton fallback", () => {
    const source = readFileSync("packages/core/src/runtime/manifest.ts", "utf-8")

    expect(source).toContain("config: KnowbeeConfig")
    expect(source).toContain("paths: RuntimePaths")
    expect(source).toContain("export function buildRuntimeManifest(options: RuntimeManifestOptions): RuntimeManifest")
    expect(source).toContain("export function refreshRuntimeManifest(options: RuntimeManifestOptions): RuntimeManifest")
    expect(source).toContain("const config = options.config")
    expect(source).not.toContain("PATHS")
    expect(source).not.toContain("options.config ?? getConfig()")
    expect(source).not.toContain("RuntimeManifestOptions = {}")
  })
})
