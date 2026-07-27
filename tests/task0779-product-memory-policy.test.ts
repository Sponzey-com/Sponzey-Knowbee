import { describe, expect, it } from "vitest"
import { buildSafeProductParameterDefaults } from "../packages/core/src/contracts/product-parameters.ts"
import { decideProductMemoryWritePolicy } from "../packages/core/src/memory/product-parameter-policy.ts"

describe("task0779 product memory policy", () => {
  it("allows long-term memory for explicit user save requests", () => {
    expect(decideProductMemoryWritePolicy({
      trigger: "explicit_user_save_request",
      runtimeLongTermRetentionConfigured: true,
    })).toEqual(expect.objectContaining({
      decision: "long_term_allowed",
      longTermAllowed: true,
      reasonCode: "explicit_user_save_request",
    }))
  })

  it("keeps explicit save requests short-term when runtime retention is not configured", () => {
    expect(decideProductMemoryWritePolicy({
      trigger: "explicit_user_save_request",
    })).toEqual(expect.objectContaining({
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "runtime_long_term_retention_missing",
    }))
  })

  it("keeps general chat short-term unless it is converted into an explicit save request", () => {
    const decision = decideProductMemoryWritePolicy({
      trigger: "general_chat",
      runtimeLongTermRetentionConfigured: true,
    })

    expect(decision).toEqual(expect.objectContaining({
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "general_chat_requires_explicit_save_request",
    }))
    expect(decision.notes).toContain("general_chat_long_term_policy=explicit_user_save_request_only")
  })

  it("keeps non-explicit writes short-term when runtime long-term retention is not configured", () => {
    expect(decideProductMemoryWritePolicy({
      trigger: "trusted_setting",
    })).toEqual(expect.objectContaining({
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "runtime_long_term_retention_missing",
    }))
  })

  it("allows non-chat reviewed writes only when runtime long-term retention is configured", () => {
    expect(decideProductMemoryWritePolicy({
      trigger: "parent_review_accepted",
      runtimeLongTermRetentionConfigured: true,
    })).toEqual(expect.objectContaining({
      decision: "long_term_allowed",
      longTermAllowed: true,
      reasonCode: "runtime_long_term_retention_configured",
    }))
  })

  it("falls back to short-term only when product parameter defaults are unsafe", () => {
    const defaults = {
      ...buildSafeProductParameterDefaults(),
      generalChatMemory: {
        longTermWritePolicy: "auto_store_all_chat" as unknown as "explicit_user_save_request_only",
      },
    }

    const decision = decideProductMemoryWritePolicy({
      trigger: "explicit_user_save_request",
      defaults,
    })

    expect(decision).toEqual(expect.objectContaining({
      decision: "short_term_only",
      longTermAllowed: false,
      reasonCode: "product_parameter_defaults_invalid",
    }))
    expect(decision.notes.join("\n")).toContain("general_chat_auto_long_term_memory_enabled")
  })
})
