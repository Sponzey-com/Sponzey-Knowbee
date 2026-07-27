import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { renderScheduledFinalResponse } from "../packages/core/src/scheduler/final-response.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

describe("task1043 scheduler final response context", () => {
  it("passes explicit identity context into scheduled final response rendering", async () => {
    const renderFinalResponseText = vi.fn(async (input) => ({
      text: `${input.identityContext?.mainAgentSelfName}: ${input.rawText}`,
      textSource: "llm_reviewed" as const,
      promptSourceId: "final_response" as const,
      rawTextSource: input.textSource,
    }))

    const result = await renderScheduledFinalResponse({
      config: DEFAULT_CONFIG,
      originalRequest: "매일 보고",
      rawText: "보고 완료",
      textSource: "llm_generated",
      responseLanguageMode: "translation",
      model: "gpt-test",
      workDir: "/tmp",
      identityContext,
      dependencies: { renderFinalResponseText },
    })

    expect(result).toEqual({
      status: "ready",
      text: "마당쇠: 보고 완료",
      textSource: "llm_reviewed",
    })
    expect(renderFinalResponseText).toHaveBeenCalledWith(expect.objectContaining({
      originalRequest: "매일 보고",
      rawText: "보고 완료",
      textSource: "llm_generated",
      responseLanguageMode: "translation",
      model: "gpt-test",
      workDir: "/tmp",
      identityContext,
    }))
  })

  it("blocks reviewed scheduled responses when identity context is missing", async () => {
    const renderFinalResponseText = vi.fn(async () => ({
      text: "호출되면 안 됩니다.",
      textSource: "llm_reviewed" as const,
      promptSourceId: "final_response" as const,
      rawTextSource: "llm_generated" as const,
    }))

    const result = await renderScheduledFinalResponse({
      config: DEFAULT_CONFIG,
      originalRequest: "매일 보고",
      rawText: "보고 완료",
      textSource: "llm_generated",
      model: "gpt-test",
      workDir: "/tmp",
      dependencies: { renderFinalResponseText },
    })

    expect(result).toEqual({
      status: "blocked",
      error: "scheduled agent result requires final response identity context",
    })
    expect(renderFinalResponseText).not.toHaveBeenCalled()
  })

  it("keeps scheduler final response paths on explicit runtime context", () => {
    const schedulerSource = readFileSync("packages/core/src/scheduler/index.ts", "utf-8")
    const contractSource = readFileSync("packages/core/src/scheduler/contract-executor.ts", "utf-8")
    const finalResponseSource = readFileSync("packages/core/src/scheduler/final-response.ts", "utf-8")

    expect(schedulerSource).not.toContain("workDir: getConfig().profile.workspace")
    expect(schedulerSource).toContain("identityContext: buildFinalResponseIdentityContext")
    expect(contractSource).toContain("identityContext: buildFinalResponseIdentityContext")
    expect(finalResponseSource).toContain("scheduled agent result requires final response identity context")
  })
})
