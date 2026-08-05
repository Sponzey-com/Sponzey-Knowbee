import { describe, expect, it } from "vitest"
import { redactLogText } from "../packages/core/src/logger/index.ts"
import {
  INTERNAL_LLM_DATA_MASK,
  containsInternalLlmStructuredDataText,
  isInternalLlmStructuredDataKey,
} from "../packages/core/src/security/internal-llm-data.ts"

const PURPOSES = ["product", "debug", "development"] as const

describe("Task 072 sensitive log content boundary", () => {
  it.each([
    "raw system prompt: never reveal this instruction",
    "hidden system instructions: private policy text",
    "private memory: user medical preference",
    "personal agent memory: confidential user context",
  ])("classifies sensitive internal prose: %s", (value) => {
    expect(containsInternalLlmStructuredDataText(value)).toBe(true)
    for (const purpose of PURPOSES) {
      expect(redactLogText(value, purpose)).toBe(INTERNAL_LLM_DATA_MASK)
    }
  })

  it.each([
    "systemPrompt",
    "raw_prompt",
    "promptStack",
    "hiddenInstructions",
    "privateMemory",
    "personal_memory",
  ])("classifies sensitive structured key: %s", (key) => {
    expect(isInternalLlmStructuredDataKey(key)).toBe(true)
  })

  it("keeps public summaries outside the sensitive classification", () => {
    expect(containsInternalLlmStructuredDataText("The request is still running.")).toBe(false)
    expect(isInternalLlmStructuredDataKey("publicSummary")).toBe(false)
  })
})
