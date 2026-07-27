import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("task1120 build setup draft config boundary", () => {
  it("requires buildSetupDraft callers to pass an explicit config snapshot", () => {
    const controlPlaneSource = readFileSync("packages/core/src/control-plane/index.ts", "utf-8")
    const setupRouteSource = readFileSync("packages/core/src/api/routes/setup.ts", "utf-8")
    const settingsRouteSource = readFileSync("packages/core/src/api/routes/settings.ts", "utf-8")
    const routingSource = readFileSync("packages/core/src/runs/routing.ts", "utf-8")
    const backendMergeTestSource = readFileSync("tests/setup-backend-merge.test.ts", "utf-8")
    const beginnerSubAgentTestSource = readFileSync("tests/task003-beginner-sub-agent-setup.test.tsx", "utf-8")
    const providerCapabilityTestSource = readFileSync("tests/task008-provider-capability.test.ts", "utf-8")

    expect(controlPlaneSource).toContain("export function buildSetupDraft(config: KnowbeeConfig, paths: SetupPersistencePaths | null): SetupDraft")
    expect(controlPlaneSource).not.toContain("export function buildSetupDraft(config: KnowbeeConfig = getConfig()): SetupDraft")
    expect(setupRouteSource).toContain("return redactSetupDraftSecrets(buildSetupDraft(config, getApiRuntimePaths(req)))")
    expect(settingsRouteSource).toContain("draft: redactSetupDraftSecrets(buildSetupDraft(config, paths))")
    expect(routingSource).toContain("return resolveRunRouteFromDraft(buildSetupDraft(config, null), input)")
    expect(backendMergeTestSource).toContain("function buildDraft() {\n  return buildSetupDraft(runtimeFixture.load(), runtimeFixture.paths)\n}")
    expect(backendMergeTestSource).not.toContain("reloadConfig")
    expect(backendMergeTestSource).not.toContain("buildSetupDraft()")
    expect(beginnerSubAgentTestSource).toContain("function buildDraft() {\n  return buildSetupDraft(runtimeFixture.load(), runtimeFixture.paths)\n}")
    expect(beginnerSubAgentTestSource).not.toContain("reloadConfig")
    expect(beginnerSubAgentTestSource).not.toContain("buildSetupDraft()")
    expect(providerCapabilityTestSource).toContain("const draft = buildSetupDraft(config, null)")
  })
})
