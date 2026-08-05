import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { normalizeRequestForIntake } from "../packages/core/src/agent/request-normalizer.ts"
import { buildResolvedExecutionProfile } from "../packages/core/src/runs/execution-profile.ts"

describe("task0862 intake source language primary boundary", () => {
  it("normalizes mixed intake messages to their primary source language", () => {
    expect(normalizeRequestForIntake("메인 화면 capture 해줘").sourceLanguage).toBe("ko")
    expect(normalizeRequestForIntake("Please ask 노비 to capture the screen").sourceLanguage).toBe("en")
  })

  it("uses primary source language in execution profile fallback structured requests", () => {
    expect(buildResolvedExecutionProfile({
      message: "메인 화면 capture 해줘",
    }).structuredRequest.source_language).toBe("ko")

    expect(buildResolvedExecutionProfile({
      message: "Please ask 노비 to capture the screen",
    }).structuredRequest.source_language).toBe("en")
  })

  it("does not advertise mixed as an intake source_language value", () => {
    const prompt = readFileSync(join(process.cwd(), "prompts/task_intake.md"), "utf-8")
    const requestNormalizer = readFileSync(join(process.cwd(), "packages/core/src/agent/request-normalizer.ts"), "utf-8")
    const intake = readFileSync(join(process.cwd(), "packages/core/src/agent/intake.ts"), "utf-8")

    expect(prompt).toContain("source_language must be the primary user-facing language")
    expect(prompt).toContain("The response-tool schema is the only output shape")
    expect(requestNormalizer).not.toContain('"mixed"')
    expect(intake).not.toContain('value === "mixed"')
  })
})
