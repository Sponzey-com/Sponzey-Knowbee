import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  defaultTaskStructuredRequest,
  parseResponseLanguageMode,
} from "../packages/core/src/agent/intake.ts"
import { buildResolvedExecutionProfile } from "../packages/core/src/runs/execution-profile.ts"

describe("task1191 response language mode contract", () => {
  it("accepts only canonical LLM-diagnosed response language modes", () => {
    expect(parseResponseLanguageMode("same_as_request")).toBe("same_as_request")
    expect(parseResponseLanguageMode("translation")).toBe("translation")
    expect(parseResponseLanguageMode("language_comparison")).toBe("language_comparison")
    expect(parseResponseLanguageMode("multilingual")).toBe("multilingual")
  })

  it("fails closed to same-request language for missing or invalid values", () => {
    expect(parseResponseLanguageMode(undefined)).toBe("same_as_request")
    expect(parseResponseLanguageMode("allow_all")).toBe("same_as_request")
    expect(defaultTaskStructuredRequest().response_language_mode).toBe("same_as_request")
  })

  it("preserves an explicit language exception in the execution profile", () => {
    const profile = buildResolvedExecutionProfile({
      message: "Translate hello into Korean.",
      structuredRequest: {
        source_language: "en",
        response_language_mode: "translation",
        normalized_english: "Translate hello into Korean.",
        target: "Korean translation of hello",
        to: "current conversation",
        context: [],
        complete_condition: ["Return the requested translation."],
      },
    })

    expect(profile.structuredRequest.response_language_mode).toBe("translation")
    expect(profile.intentEnvelope.response_language_mode).toBe("translation")
  })

  it("assigns language-exception diagnosis to the intake LLM prompt", () => {
    const prompt = readFileSync("prompts/task_intake.md", "utf8")

    expect(prompt).toContain("Use `translation`, `language_comparison`, or `multilingual`")
    expect(prompt).toContain(
      "Set response_language_mode to a non-default value only when the user explicitly requests that output form.",
    )
  })
})
