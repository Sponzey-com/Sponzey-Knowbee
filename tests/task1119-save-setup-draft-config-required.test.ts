import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1119 save setup draft config boundary", () => {
  it("requires saveSetupDraft callers to pass an explicit config snapshot", () => {
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const setupRouteSource = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    const backendMergeTestSource = readFileSync("tests/setup-backend-merge.test.ts", "utf-8")
    const beginnerSubAgentTestSource = readFileSync("tests/task003-beginner-sub-agent-setup.test.tsx", "utf-8")

    expect(controlPlaneSource).toContain("state: SetupState | undefined,\n  config: KnowbeeConfig,\n  paths: SetupPersistencePaths,\n): { draft: SetupDraft; state: SetupState }")
    expect(controlPlaneSource).not.toContain("config: KnowbeeConfig = getConfig(),\n): { draft: SetupDraft; state: SetupState }")
    expect(setupRouteSource).toContain("const saved = saveSetupDraft(req.body.draft, req.body.state, config, getApiRuntimePaths(req))")
    expect(settingsRouteSource).toContain("const saved = saveSetupDraft(payload.draft, payload.state, currentConfig, paths)")
    expect(backendMergeTestSource).toContain("function saveDraft(inputDraft: Parameters<typeof saveSetupDraft>[0])")
    expect(backendMergeTestSource).toContain("return saveSetupDraft(inputDraft, undefined, runtimeFixture.load(), runtimeFixture.paths)")
    expect(backendMergeTestSource).not.toContain("reloadConfig")
    expect(backendMergeTestSource).not.toMatch(/[^A-Za-z]saveSetupDraft\(\{/)
    expect(beginnerSubAgentTestSource).toContain("runtimeFixture.load(),\n      runtimeFixture.paths,")
    expect(beginnerSubAgentTestSource).not.toContain("reloadConfig")
  })
})
