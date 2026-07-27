import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeImprovementMutation,
  executeAuthorizedImprovementMutation,
} from "../packages/core/src/memory/improvement-mutation-boundary.ts"

const runtimeSnapshot = { snapshotId: "startup-config:fingerprint:v1", capturedAt: Date.UTC(2026, 6, 14) }

describe("task1355 external configuration exclusion", () => {
  it.each([
    ["provider_configuration", "provider_configuration_forbidden"],
    ["runtime_environment", "runtime_environment_forbidden"],
    ["yeonjang_permission_policy", "yeonjang_permission_policy_forbidden"],
  ] as const)("blocks explicit external target kind %s", async (targetKind, reasonCode) => {
    const decision = authorizeImprovementMutation({
      target: { targetKind, requestedRef: `${targetKind}:active`, withinWorkspace: true, traversedSymlink: false, sourceAuthorization: "prompt_source" },
      runtimeSnapshot,
    })
    const mutate = vi.fn()
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await expect(executeAuthorizedImprovementMutation({ decision, mutate })).resolves.toEqual(decision)
    expect(mutate).not.toHaveBeenCalled()
  })

  it.each([
    ["CONFIG\\PROVIDERS\\OPENAI.JSON", "config/providers/openai.json", "provider_configuration_forbidden"],
    ["model-providers.yaml", "model-providers.yaml", "provider_configuration_forbidden"],
    [".ENV.PRODUCTION", ".env.production", "runtime_environment_forbidden"],
    ["config/runtime-environment.json", "config/runtime-environment.json", "runtime_environment_forbidden"],
    ["YEONJANG\\PERMISSIONS.JSON", "yeonjang/permissions.json", "yeonjang_permission_policy_forbidden"],
    ["config/yeonjang-policy.yaml", "config/yeonjang-policy.yaml", "yeonjang_permission_policy_forbidden"],
  ] as const)("blocks canonical external configuration alias %s", async (requestedRef, canonicalWorkspacePath, reasonCode) => {
    const decision = authorizeImprovementMutation({
      target: { targetKind: "file", requestedRef, canonicalWorkspacePath, withinWorkspace: true, traversedSymlink: false, sourceAuthorization: "prompt_source" },
      runtimeSnapshot,
    })
    const mutate = vi.fn()
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await expect(executeAuthorizedImprovementMutation({ decision, mutate })).resolves.toEqual(decision)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("keeps exact prompt source mutation available with the same startup snapshot", () => {
    expect(authorizeImprovementMutation({
      target: { targetKind: "file", requestedRef: "prompts/tool_policy.md", canonicalWorkspacePath: "prompts/tool_policy.md", withinWorkspace: true, traversedSymlink: false, sourceAuthorization: "prompt_source" },
      runtimeSnapshot,
    })).toMatchObject({ status: "authorized", runtimeSnapshotId: "startup-config:fingerprint:v1" })
  })

  it("does not read environment or provider registries after startup", () => {
    const source = readFileSync(new URL("../packages/core/src/memory/improvement-mutation-boundary.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|getProvider|providerRegistry|readFile|writeFile|globalThis|fetch\(/u)
    expect(source).toContain("runtimeSnapshot.snapshotId")
  })
})
