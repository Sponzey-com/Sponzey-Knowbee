import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

function source(path: string): string {
  return readFileSync(path, "utf-8")
}

describe("task1064 setup extension config snapshot", () => {
  it("requires explicit config snapshots for setup extension draft helpers", () => {
    const sourceText = source("packages/core/src/control-plane/setup-extensions.ts")
    const controlPlaneSource = source("packages/core/src/control-plane/index.ts")

    expect(sourceText).toContain("buildMcpSetupDraft(config: KnowbeeConfig)")
    expect(sourceText).toContain("buildSkillsSetupDraft(config: KnowbeeConfig)")
    expect(sourceText).not.toContain("= getConfig()")
    expect(sourceText).not.toContain("../config/index.js")
    expect(controlPlaneSource).toContain("mcp: buildMcpSetupDraft(config)")
    expect(controlPlaneSource).toContain("skills: buildSkillsSetupDraft(config)")
  })
})
