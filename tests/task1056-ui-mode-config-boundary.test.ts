import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1056 UI mode config boundary", () => {
  it("keeps UI mode resolvers independent from config singleton reads", () => {
    const source = readFileSync("packages/core/src/ui/mode.ts", "utf-8")

    expect(source).not.toContain("getConfig().webui")
    expect(source).toContain("const configEnabled = input.configEnabled ?? false")
    expect(source).toContain("const preferredUiMode = normalizePreferredUiMode(input.preferredUiMode ?? \"beginner\")")
    expect(source).toContain("getUiModeState(input: UiModeRuntimeConfigInput): UiModeState")
    expect(source).toContain("const config = input.config")
    expect(source).not.toContain("const config = input.config ?? getConfig()")
    expect(source).not.toContain("reloadConfig")
    expect(source).toContain("const config: KnowbeeConfig = {")
    expect(source).toContain("return getUiModeState({ ...input, config })")
    expect(source).toContain("configEnabled: input.adminActivation?.configEnabled ?? (config.webui.admin?.enabled ?? false)")
    expect(source).toContain("preferredUiMode: config.webui.preferredUiMode")
  })
})
