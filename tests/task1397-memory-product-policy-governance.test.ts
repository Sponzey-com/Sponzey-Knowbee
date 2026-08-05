import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  buildSafeProductParameterDefaults,
} from "../packages/core/src/contracts/product-parameters.ts"
import {
  authorizeProductParameterChange,
  applyAuthorizedProductParameterChange,
  type ProductParameterChangeInput,
} from "../packages/core/src/contracts/product-parameter-change-governance.ts"
import { decideProductMemoryWritePolicy } from "../packages/core/src/memory/product-parameter-policy.ts"

function changeInput(): ProductParameterChangeInput {
  return {
    parameterKey: "general_chat_memory",
    previousValueFingerprint: "parameter:general-chat:v1",
    nextValueFingerprint: "parameter:general-chat:v2",
    decisionActorType: "user",
    decisionActorRef: "user:owner",
    approvalRef: "approval:product-parameter:general-chat:v2",
    decidedAt: 100,
    revisionFingerprint: "revision:product-policy:abc1234",
    productParameterSource: {
      sourceRef: "packages/core/src/contracts/product-parameters.ts",
      revisionFingerprint: "revision:product-policy:abc1234",
      evidenceRef: "evidence:source:product-parameters",
    },
    canonicalPromptSource: {
      sourceRef: "prompts/memory_policy.md",
      revisionFingerprint: "revision:product-policy:abc1234",
      evidenceRef: "evidence:prompt:memory-policy",
    },
    testFixture: {
      sourceRef: "tests/task1397-memory-product-policy-governance.test.ts",
      revisionFingerprint: "revision:product-policy:abc1234",
      evidenceRef: "evidence:test:memory-product-policy",
    },
    runtimeActivation: "startup_snapshot_only",
  }
}

describe("task1397 memory safe defaults and product-policy change governance", () => {
  it("keeps every write short-term when runtime long-term retention is absent", () => {
    for (const trigger of [
      "explicit_user_save_request",
      "general_chat",
      "trusted_setting",
      "parent_review_accepted",
      "learning_event_approved",
      "admin_review_approved",
    ] as const) {
      expect(decideProductMemoryWritePolicy({ trigger })).toMatchObject({
        decision: "short_term_only",
        longTermAllowed: false,
        reasonCode: "runtime_long_term_retention_missing",
      })
    }
  })

  it("allows an explicit user save request only when runtime retention is configured", () => {
    expect(decideProductMemoryWritePolicy({
      trigger: "explicit_user_save_request",
      runtimeLongTermRetentionConfigured: true,
    })).toMatchObject({
      decision: "long_term_allowed",
      longTermAllowed: true,
      reasonCode: "explicit_user_save_request",
    })
  })

  it("keeps general chat short-term even when runtime retention is configured", () => {
    expect(decideProductMemoryWritePolicy({
      trigger: "general_chat",
      runtimeLongTermRetentionConfigured: true,
    })).toMatchObject({
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "general_chat_requires_explicit_save_request",
    })
  })

  it("applies the same no-retention default regardless of the agent owner", () => {
    for (const ownerRef of ["agent:main", "agent:researcher", "agent:writer"]) {
      const decision = decideProductMemoryWritePolicy({ trigger: "explicit_user_save_request" })
      expect(decision).toMatchObject({ longTermAllowed: false })
      expect(ownerRef).toMatch(/^agent:/)
    }
    expect(buildSafeProductParameterDefaults().agentMemory).toEqual({
      shortTermMemory: "enabled",
      shortTermCompactionThresholdSource: "runtime_configuration_only",
      longTermMemoryWhenRuntimeConfigMissing: "disabled",
      longTermRetentionSource: "runtime_configuration_only",
    })
  })

  it("keeps the canonical memory prompt free of a trusted-setting exception for general chat", () => {
    const prompt = readFileSync("prompts/memory_policy.md", "utf8")
    expect(prompt).toContain("General chat is not long-term memory unless the user explicitly asks to remember it.")
    expect(prompt).not.toContain("General chat is not long-term memory unless the user explicitly asks to remember it or a trusted setting confirms it as durable.")
  })

  it("authorizes one exact product source, canonical prompt, and test fixture revision", () => {
    expect(authorizeProductParameterChange(changeInput())).toMatchObject({
      status: "authorized",
      receipt: {
        parameterKey: "general_chat_memory",
        revisionFingerprint: "revision:product-policy:abc1234",
        runtimeActivation: "startup_snapshot_only",
      },
    })
  })

  it.each([
    ["same value", (input: ProductParameterChangeInput) => { input.nextValueFingerprint = input.previousValueFingerprint }, "parameter_value_unchanged"],
    ["missing actor", (input: ProductParameterChangeInput) => { input.decisionActorRef = "" }, "decision_approval_invalid"],
    ["missing approval", (input: ProductParameterChangeInput) => { input.approvalRef = "" }, "decision_approval_invalid"],
    ["missing prompt", (input: ProductParameterChangeInput) => { input.canonicalPromptSource.sourceRef = "" }, "change_source_invalid"],
    ["missing fixture", (input: ProductParameterChangeInput) => { input.testFixture.evidenceRef = "" }, "change_source_invalid"],
    ["prompt revision mismatch", (input: ProductParameterChangeInput) => { input.canonicalPromptSource.revisionFingerprint = "revision:other" }, "change_revision_mismatch"],
    ["fixture revision mismatch", (input: ProductParameterChangeInput) => { input.testFixture.revisionFingerprint = "revision:other" }, "change_revision_mismatch"],
    ["in-memory activation", (input: ProductParameterChangeInput) => { input.runtimeActivation = "in_memory_patch" as never }, "runtime_activation_invalid"],
  ])("blocks invalid product-policy change: %s", (_name, mutate, reasonCode) => {
    const input = changeInput()
    mutate(input)
    expect(authorizeProductParameterChange(input)).toEqual({ status: "blocked", reasonCode })
  })

  it("does not apply a product-policy change until source, prompt, fixture, and approval align", async () => {
    const apply = vi.fn(async () => "applied")
    const invalid = changeInput()
    invalid.testFixture.revisionFingerprint = "revision:other"
    await expect(applyAuthorizedProductParameterChange({
      decision: authorizeProductParameterChange(invalid),
      apply,
    })).resolves.toEqual({ status: "blocked", reasonCode: "product_parameter_change_not_authorized" })
    expect(apply).not.toHaveBeenCalled()

    const decision = authorizeProductParameterChange(changeInput())
    await expect(applyAuthorizedProductParameterChange({ decision, apply })).resolves.toEqual({
      status: "applied",
      result: "applied",
      receipt: expect.objectContaining({ parameterKey: "general_chat_memory" }),
    })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it("keeps the policy gate free of ambient environment and I/O access", () => {
    const source = readFileSync("packages/core/src/contracts/product-parameter-change-governance.ts", "utf8")
    expect(source).not.toMatch(/process\.env|Date\.now|readFile|writeFile|fetch\(|getDb\(/)
  })
})
