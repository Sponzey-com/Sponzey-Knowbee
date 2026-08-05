import { describe, expect, it } from "vitest"
import {
  createWebResearchContextBudget,
  type TokenEstimatorPort,
} from "../packages/core/src/contracts/web-research-context-budget.ts"

const estimator: TokenEstimatorPort = Object.freeze({
  version: "fixture-word-v1",
  estimateTokens(text) {
    return text.trim() ? text.trim().split(/\s+/u).length : 0
  },
})

describe("web research context budget", () => {
  it("creates the documented immutable 8K allocation without retaining raw input", () => {
    const result = createWebResearchContextBudget({
      modelContextTokens: 8_000,
      systemToolText: "system tool",
      conversationText: "one two three",
    }, estimator)

    expect(result).toMatchObject({
      ok: true,
      value: {
        modelContextTokens: 8_000,
        allocations: {
          systemToolTokens: 1_500,
          conversationTokens: 1_500,
          webEvidenceTokens: 3_000,
          answerReserveTokens: 2_000,
        },
        estimatedUse: {
          systemToolTokens: 2,
          conversationTokens: 3,
        },
        estimatorVersion: "fixture-word-v1",
        unallocatedTokens: 0,
      },
    })
    if (!result.ok) throw new Error(result.reasonCode)
    expect(result.value.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(result.value.inputFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u)
    expect(JSON.stringify(result.value)).not.toContain("one two three")
    expect(Object.isFrozen(result.value)).toBe(true)
    expect(Object.isFrozen(result.value.allocations)).toBe(true)
    expect(Object.isFrozen(result.value.estimatedUse)).toBe(true)
  })

  it("caps web evidence at 12K for large contexts and reports unused capacity", () => {
    const result = createWebResearchContextBudget({
      modelContextTokens: 32_000,
      systemToolText: "",
      conversationText: "",
    }, estimator)

    expect(result).toMatchObject({
      ok: true,
      value: {
        allocations: { webEvidenceTokens: 12_000, answerReserveTokens: 2_000 },
        unallocatedTokens: 15_000,
      },
    })
  })

  it("reduces web evidence first when measured system/tool input grows", () => {
    const measuredEstimator: TokenEstimatorPort = {
      version: "measured-v1",
      estimateTokens: (text) => text === "system" ? 1_700 : 10,
    }

    const result = createWebResearchContextBudget({
      modelContextTokens: 8_000,
      systemToolText: "system",
      conversationText: "conversation",
    }, measuredEstimator)

    expect(result).toMatchObject({
      ok: true,
      value: {
        allocations: {
          systemToolTokens: 1_700,
          conversationTokens: 1_500,
          webEvidenceTokens: 2_800,
          answerReserveTokens: 2_000,
        },
      },
    })
  })

  it.each([
    ["non-integer context", { modelContextTokens: 8_000.5 }],
    ["negative allocation", { modelContextTokens: 8_000, allocations: { webEvidenceTokens: -1 } }],
    ["web hard cap", { modelContextTokens: 20_000, allocations: { webEvidenceTokens: 12_001 } }],
    ["answer reserve", { modelContextTokens: 8_000, allocations: { answerReserveTokens: 1_999 } }],
    ["sum overflow", {
      modelContextTokens: 8_000,
      allocations: {
        systemToolTokens: 2_000,
        conversationTokens: 2_000,
        webEvidenceTokens: 3_000,
        answerReserveTokens: 2_000,
      },
    }],
  ] as const)("rejects %s", (_label, invalid) => {
    expect(createWebResearchContextBudget({
      systemToolText: "",
      conversationText: "",
      ...invalid,
    }, estimator)).toMatchObject({ ok: false })
  })

  it("rejects estimator usage above its allocation", () => {
    const tooLarge: TokenEstimatorPort = {
      version: "oversized-v1",
      estimateTokens: () => 1_501,
    }

    expect(createWebResearchContextBudget({
      modelContextTokens: 8_000,
      systemToolText: "system",
      conversationText: "conversation",
      allocations: {
        systemToolTokens: 1_500,
        conversationTokens: 1_500,
      },
    }, tooLarge)).toEqual({
      ok: false,
      reasonCode: "context_budget_input_exceeds_allocation",
    })
  })

  it("produces a stable fingerprint and changes it with the measured input", () => {
    const first = createWebResearchContextBudget({
      modelContextTokens: 8_000,
      systemToolText: "same",
      conversationText: "first",
    }, estimator)
    const repeated = createWebResearchContextBudget({
      modelContextTokens: 8_000,
      systemToolText: "same",
      conversationText: "first",
    }, estimator)
    const changed = createWebResearchContextBudget({
      modelContextTokens: 8_000,
      systemToolText: "same",
      conversationText: "second",
    }, estimator)

    expect(first).toEqual(repeated)
    expect(first.ok && changed.ok && first.value.fingerprint)
      .not.toBe(changed.ok && changed.value.fingerprint)
  })
})
