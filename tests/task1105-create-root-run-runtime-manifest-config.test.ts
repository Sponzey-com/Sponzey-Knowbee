import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1105 create root run runtime manifest config", () => {
  it("uses only the startup-owned runtime manifest for root runs", () => {
    const storeSource = readFileSync("packages/core/src/runs/store.ts", "utf-8")
    const startLaunchSource = readFileSync("packages/core/src/runs/start-launch.ts", "utf-8")
    const startSource = readFileSync("packages/core/src/runs/start.ts", "utf-8")

    expect(storeSource).not.toContain("runtimeManifestConfig")
    expect(storeSource).not.toContain("refreshRuntimeManifest")
    expect(startLaunchSource).not.toContain("runtimeManifestConfig")
    expect(startSource).not.toContain("runtimeManifestConfig")
  })
})
