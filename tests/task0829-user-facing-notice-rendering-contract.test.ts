import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { LoopDirectiveNotice } from "../packages/core/src/runs/loop-directive.ts"
import type { StandaloneAssistantMessageNotice } from "../packages/core/src/runs/finalization.ts"
import { renderUserFacingNoticeText } from "../packages/core/src/runs/user-facing-notice-rendering.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

const identityContext = {
  promptLocale: "ko" as const,
  mainAgentSelfName: "마당쇠",
  promptContext: "[Trusted Main Agent Identity]\nCurrent main-agent self name: `마당쇠`\n",
}

describe("task0829 user-facing notice rendering contract", () => {
  it("does not read global config inside the notice renderer", () => {
    const source = readFileSync("packages/core/src/runs/user-facing-notice-rendering.ts", "utf-8")

    expect(source).not.toContain("../config/index.js")
    expect(source).not.toContain("getConfig(")
  })

  it("requires loop directive notices to declare final response rendering", () => {
    const notice: LoopDirectiveNotice = {
      kind: "contract_check",
      textSource: "contract_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    }

    expect(notice.renderingRequired).toBe("llm_final_response")
  })

  it("requires standalone assistant notices to declare final response rendering", () => {
    const notice: StandaloneAssistantMessageNotice = {
      kind: "contract_check",
      textSource: "contract_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    }

    expect(notice.renderingRequired).toBe("llm_final_response")
  })

  it("derives notice identity context from the explicit config", async () => {
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(
        input,
        `${input.identityContext?.mainAgentSelfName}: ${input.rawText}`,
      ))
    const rendered = await renderUserFacingNoticeText({
      originalRequest: "상태 알려줘",
      rawText: "처리 상태입니다.",
      reasonPrefix: "contract_notice",
      dependencies: {
        config: DEFAULT_CONFIG,
        workDir: process.cwd(),
        getDefaultModel: () => "test-model",
        renderFinalResponseText,
      },
    })

    expect(rendered).toEqual(expect.objectContaining({
      status: "ready",
      textSource: "llm_reviewed",
    }))
    expect(renderFinalResponseText).toHaveBeenCalledWith(expect.objectContaining({
      identityContext: expect.objectContaining({
        mainAgentSelfName: expect.any(String),
        promptContext: expect.any(String),
      }),
    }))
  })

  it("passes explicit identity context to final response rendering", async () => {
    const rendered = await renderUserFacingNoticeText({
      originalRequest: "상태 알려줘",
      rawText: "처리 상태입니다.",
      reasonPrefix: "contract_notice",
      dependencies: {
        config: DEFAULT_CONFIG,
        workDir: process.cwd(),
        identityContext,
        getDefaultModel: () => "test-model",
        renderFinalResponseText: async (input) => buildReviewedFinalResponse(
          input,
          `${input.identityContext?.mainAgentSelfName}: ${input.rawText}`,
        ),
      },
    })

    expect(rendered).toEqual({
      status: "ready",
      text: "마당쇠: 처리 상태입니다.",
      textSource: "llm_reviewed",
    })
  })
})
