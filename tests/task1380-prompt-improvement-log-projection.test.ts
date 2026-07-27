import { describe, expect, it, vi } from "vitest"
import {
  PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST,
  authorizePromptImprovementLogProjection,
  writeAuthorizedPromptImprovementLog,
} from "../packages/core/src/contracts/prompt-improvement-log-projection.ts"

describe("task1380 prompt improvement log projection", () => {
  it.each([
    ["product", { event: "finished", state: "completed", finalResult: "ok", checksumRef: "hidden" }],
    ["field_debug", { event: "transition", checksumRef: "sha:redacted", retryCount: 1, diffRef: "hidden" }],
    ["development", { event: "fixture", diffRef: "diff:redacted", fixtureNames: ["fixture:a"], state: "hidden" }],
  ] as const)("projects only the %s allowlist", (purpose, fields) => {
    const decision = authorizePromptImprovementLogProjection({ runtimeMode: "development", purpose, fields })
    expect(decision).toMatchObject({ status: "authorized", purpose })
    if (decision.status === "authorized") {
      expect(Object.keys(decision.fields).every((key) => (PROMPT_IMPROVEMENT_LOG_FIELD_MANIFEST[purpose] as readonly string[]).includes(key))).toBe(true)
    }
  })

  it("blocks development projection in production before writing", async () => {
    const write = vi.fn()
    const decision = authorizePromptImprovementLogProjection({ runtimeMode: "production", purpose: "development", fields: { event: "fixture" } })
    expect(decision).toEqual({ status: "blocked", reasonCode: "development_log_forbidden" })
    await writeAuthorizedPromptImprovementLog({ decision, write })
    expect(write).not.toHaveBeenCalled()
  })

  it.each(["rawPrompt", "secret", "token", "privateMemory"])("rejects unsafe field %s at every level", (key) => {
    expect(authorizePromptImprovementLogProjection({ runtimeMode: "test", purpose: "development", fields: { event: "x", [key]: "value" } }))
      .toEqual({ status: "blocked", reasonCode: "log_payload_unsafe" })
  })
})
