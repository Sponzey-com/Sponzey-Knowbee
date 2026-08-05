import { describe, expect, it, vi } from "vitest"
import {
  PROTECTED_COMMON_PROMPT_SOURCES,
  authorizeImprovementMutation,
  executeAuthorizedImprovementMutation,
  type CommonPromptPolicyApprovalReceipt,
  type ImprovementMutationTargetReceipt,
} from "../packages/core/src/memory/improvement-mutation-boundary.ts"

const now = Date.UTC(2026, 6, 15, 13)
const runtimeSnapshot = { snapshotId: "startup:runtime:1385", capturedAt: now - 1_000 }

function target(path = "prompts/identity.md", overrides: Partial<ImprovementMutationTargetReceipt> = {}): ImprovementMutationTargetReceipt {
  return {
    targetKind: "file",
    requestedRef: path,
    canonicalWorkspacePath: path,
    withinWorkspace: true,
    traversedSymlink: false,
    sourceAuthorization: "prompt_source",
    ...overrides,
  }
}

function approval(sourceRef: string, overrides: Partial<CommonPromptPolicyApprovalReceipt> = {}): CommonPromptPolicyApprovalReceipt {
  return {
    schemaVersion: 1,
    approvalId: `approval:${sourceRef}:1385`,
    approvedBy: "administrator:owner",
    approvedByType: "administrator",
    scope: "common_prompt_policy_mutation",
    sourceRef,
    risk: "high",
    issuedAt: now - 100,
    expiresAt: now + 100,
    ...overrides,
  }
}

describe("task1385 protected improvement mutation targets", () => {
  it("keeps an ordinary exact prompt source independent from common-policy approval", () => {
    expect(authorizeImprovementMutation({ target: target(), runtimeSnapshot }))
      .toMatchObject({ status: "authorized", runtimeSnapshotId: "startup:runtime:1385" })
  })

  it.each(PROTECTED_COMMON_PROMPT_SOURCES)(
    "authorizes exact high-risk approval for common $policyKind policy",
    ({ sourceRef }) => {
      expect(authorizeImprovementMutation({
        target: target(sourceRef),
        runtimeSnapshot,
        commonPolicyApproval: approval(sourceRef),
        now,
      })).toMatchObject({ status: "authorized", target: { canonicalWorkspacePath: sourceRef } })
    },
  )

  it.each(["hidden_runtime_instruction", "in_memory_patch", "compiled_artifact"] as const)(
    "blocks protected mutation target kind %s before callback",
    async (targetKind) => {
      const mutate = vi.fn()
      const decision = authorizeImprovementMutation({ target: target("prompts/identity.md", { targetKind }), runtimeSnapshot })

      expect(decision).toEqual({
        status: "blocked",
        reasonCode: targetKind === "compiled_artifact" ? "compiled_artifact_forbidden" : "runtime_mutation_forbidden",
      })
      await executeAuthorizedImprovementMutation({ decision, mutate })
      expect(mutate).not.toHaveBeenCalled()
    },
  )

  it.each([
    "packages/core/src/index.js",
    "packages/core/src/index.d.ts",
    "packages/core/src/index.js.map",
    "dist/core/index.js",
    "target/release/knowbee.exe",
    "artifacts/runtime.wasm",
  ])("blocks compiled artifact path %s even when presented as a file", async (path) => {
    const mutate = vi.fn()
    const decision = authorizeImprovementMutation({ target: target(path), runtimeSnapshot })

    expect(decision).toEqual({ status: "blocked", reasonCode: "compiled_artifact_forbidden" })
    await executeAuthorizedImprovementMutation({ decision, mutate })
    expect(mutate).not.toHaveBeenCalled()
  })

  it.each(PROTECTED_COMMON_PROMPT_SOURCES)(
    "requires higher approval for common $policyKind policy",
    async ({ sourceRef }) => {
      const mutate = vi.fn()
      const decision = authorizeImprovementMutation({ target: target(sourceRef), runtimeSnapshot })

      expect(decision).toEqual({ status: "blocked", reasonCode: "common_policy_approval_required" })
      await executeAuthorizedImprovementMutation({ decision, mutate })
      expect(mutate).not.toHaveBeenCalled()
    },
  )

  it.each([
    [approval("prompts/system.md", { risk: "medium" as "high" }), "common_policy_approval_invalid"],
    [approval("prompts/system.md", { approvedByType: "agent" as "user" }), "common_policy_approval_invalid"],
    [approval("prompts/system.md", { scope: "apply" as "common_prompt_policy_mutation" }), "common_policy_approval_invalid"],
    [approval("prompts/system.md", { expiresAt: now }), "common_policy_approval_invalid"],
    [approval("prompts/tool_policy.md"), "common_policy_approval_scope_mismatch"],
  ] as const)("blocks invalid or mismatched common policy approval %#", async (commonPolicyApproval, reasonCode) => {
    const mutate = vi.fn()
    const decision = authorizeImprovementMutation({
      target: target("prompts/system.md"),
      runtimeSnapshot,
      commonPolicyApproval,
      now,
    })

    expect(decision).toEqual({ status: "blocked", reasonCode })
    await executeAuthorizedImprovementMutation({ decision, mutate })
    expect(mutate).not.toHaveBeenCalled()
  })

  it("invokes only the authorized matching mutation callback", async () => {
    const mutate = vi.fn(async () => "saved")
    const decision = authorizeImprovementMutation({
      target: target("prompts/yeonjang_policy.md"),
      runtimeSnapshot,
      commonPolicyApproval: approval("prompts/yeonjang_policy.md"),
      now,
    })

    await expect(executeAuthorizedImprovementMutation({ decision, mutate }))
      .resolves.toEqual({ status: "mutated", result: "saved" })
    expect(mutate).toHaveBeenCalledTimes(1)
  })
})
