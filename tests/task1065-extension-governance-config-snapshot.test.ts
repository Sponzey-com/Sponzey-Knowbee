import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1065 extension governance config snapshot", () => {
  it("requires explicit config snapshots for extension registry rendering", () => {
    const sourceText = source("packages/core/src/security/extension-governance.ts")
    const doctorSource = source("packages/core/src/diagnostics/doctor.ts")

    expect(sourceText).toContain("config: KnowbeeConfig")
    expect(sourceText).toContain("storage: ExtensionGovernanceStorage")
    expect(sourceText).toContain("const config = input.config")
    expect(sourceText).not.toContain("getConfig()")
    expect(sourceText).not.toContain("input.config ?? getConfig()")
    expect(doctorSource).toContain("buildExtensionRegistrySnapshot({")
    expect(doctorSource).toContain("config,")
    expect(doctorSource).toContain("storage: createExtensionGovernanceStorage(paths)")
  })
})
