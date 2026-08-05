import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  authorizeImprovementMutation,
  executeAuthorizedImprovementMutation,
  type ImprovementMutationTargetReceipt,
} from "../packages/core/src/memory/improvement-mutation-boundary.ts"

const runtimeSnapshot = { snapshotId: "startup:runtime:v1", capturedAt: Date.UTC(2026, 6, 14) }

function target(overrides: Partial<ImprovementMutationTargetReceipt> = {}): ImprovementMutationTargetReceipt {
  return {
    targetKind: "file",
    requestedRef: "prompts/identity.md",
    canonicalWorkspacePath: "prompts/identity.md",
    withinWorkspace: true,
    traversedSymlink: false,
    sourceAuthorization: "prompt_source",
    ...overrides,
  }
}

describe("task1352 improvement mutation boundary", () => {
  it("authorizes an exact prompt source using only the injected runtime snapshot", () => {
    expect(authorizeImprovementMutation({ target: target(), runtimeSnapshot })).toMatchObject({
      status: "authorized", runtimeSnapshotId: "startup:runtime:v1", target: { canonicalWorkspacePath: "prompts/identity.md" },
    })
  })

  it.each(["harness_approval_policy", "harness_state_machine"] as const)("authorizes canonical harness source for %s", (sourceAuthorization) => {
    expect(authorizeImprovementMutation({ target: target({
      requestedRef: "packages/core/src/memory/prompt-improvement-harness.ts",
      canonicalWorkspacePath: "packages/core/src/memory/prompt-improvement-harness.ts",
      sourceAuthorization,
    }), runtimeSnapshot }).status).toBe("authorized")
  })

  it.each(["hidden_runtime_instruction", "environment_lookup", "in_memory_patch"] as const)(
    "blocks runtime mutation kind %s before callback",
    async (targetKind) => {
      const mutate = vi.fn()
      const decision = authorizeImprovementMutation({ target: target({ targetKind }), runtimeSnapshot })
      expect(decision).toEqual({ status: "blocked", reasonCode: "runtime_mutation_forbidden" })
      await expect(executeAuthorizedImprovementMutation({ decision, mutate })).resolves.toEqual(decision)
      expect(mutate).not.toHaveBeenCalled()
    },
  )

  it.each([
    ["../packages/core/src/index.ts", "packages/core/src/index.ts", false, false, "path_escape_forbidden"],
    ["prompts/identity.md", "packages/core/src/index.ts", true, true, "symlink_forbidden"],
    ["PACKAGES\\CORE\\SRC\\INDEX.TS", "packages/core/src/index.ts", false, true, "application_code_forbidden"],
    ["pnpm-lock.yaml", "pnpm-lock.yaml", false, true, "lockfile_forbidden"],
    ["PACKAGE-LOCK.JSON", "package-lock.json", false, true, "lockfile_forbidden"],
  ] as const)("blocks normalized mutation bypass %s", async (requestedRef, canonicalWorkspacePath, traversedSymlink, withinWorkspace, reasonCode) => {
    const mutate = vi.fn()
    const decision = authorizeImprovementMutation({ target: target({ requestedRef, canonicalWorkspacePath, traversedSymlink, withinWorkspace }), runtimeSnapshot })
    expect(decision).toEqual({ status: "blocked", reasonCode })
    await expect(executeAuthorizedImprovementMutation({ decision, mutate })).resolves.toEqual(decision)
    expect(mutate).not.toHaveBeenCalled()
  })

  it("does not allow prompt authorization to write the harness application-code file", () => {
    expect(authorizeImprovementMutation({ target: target({
      requestedRef: "packages/core/src/memory/prompt-improvement-harness.ts",
      canonicalWorkspacePath: "packages/core/src/memory/prompt-improvement-harness.ts",
    }), runtimeSnapshot })).toEqual({ status: "blocked", reasonCode: "application_code_forbidden" })
  })

  it("keeps the gate independent from environment, filesystem, and global state", () => {
    const source = readFileSync(new URL("../packages/core/src/memory/improvement-mutation-boundary.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/from ["'](?:node:|better-sqlite3|openai|@anthropic-ai\/sdk)/u)
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|realpath|globalThis|fetch\(/u)
  })
})
