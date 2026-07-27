import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { KnowbeeConfig } from "../packages/core/src/config/types.ts"
import { buildFinalResponseIdentityContext } from "../packages/core/src/runs/final-response-renderer.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const tempDirs: string[] = []

function useTempConfig(mainAgentName = "마당쇠"): KnowbeeConfig {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0921-final-response-name-"))
  tempDirs.push(rootDir)
  return createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    profile: { profileName: "사용자", displayName: "사용자", language: "ko" },
    orchestration: {
      knowbee: {
        agentName: "${mainAgentName}",
        displayName: "Legacy Main Display",
        nickname: "Legacy Main Nick"
      }
    }
  }`,
  }).config
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0921 final response main-agent identity", () => {
  it("keeps the configured main-agent name when final response rewrite returns a stale default name", async () => {
    const config = useTempConfig("마당쇠")
    const { renderFinalResponseText } = await import("../packages/core/src/runs/final-response-renderer.ts")
    const chat = vi.fn(async function* (input: {
      system: string
      messages: Array<{ role: string; content: string }>
    }) {
      expect(input.system).toContain("[Trusted Main Agent Identity]")
      expect(input.system).toContain("Current main-agent self name: `마당쇠`")
      expect(input.messages[0]?.content).toContain("Original user request:\n니 이름이 뭐니?")
      expect(input.messages[0]?.content).toContain("Raw completion text:\n제 이름은 마당쇠입니다.")
      yield { type: "text_delta", delta: "제 이름은 Knowbee예요." } as const
    })

    const result = await renderFinalResponseText({
      config,
      originalRequest: "니 이름이 뭐니?",
      rawText: "제 이름은 마당쇠입니다.",
      textSource: "llm_generated",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
      identityContext: buildFinalResponseIdentityContext({
        config,
        originalRequest: "니 이름이 뭐니?",
        workDir: process.cwd(),
      }),
    })

    expect(result).toEqual(expect.objectContaining({
      text: "제 이름은 마당쇠입니다.",
      textSource: "llm_reviewed",
      promptSourceId: "final_response",
      rawTextSource: "llm_generated",
      reviewReceipt: expect.objectContaining({
        reviewedBy: "llm_final_response",
        responseLanguage: "ko",
      }),
    }))
    expect(JSON.stringify(result)).not.toContain("Knowbee")
  })

  it("does not rewrite user-name questions as assistant self-name answers", async () => {
    const config = useTempConfig("마당쇠")
    const { renderFinalResponseText } = await import("../packages/core/src/runs/final-response-renderer.ts")
    const chat = vi.fn(async function* () {
      yield { type: "text_delta", delta: "사용자 이름은 아직 확인되지 않았습니다." } as const
    })

    const result = await renderFinalResponseText({
      config,
      originalRequest: "내 이름이 뭐니?",
      rawText: "사용자 이름은 아직 확인되지 않았습니다.",
      textSource: "llm_generated",
      model: "gpt-test",
      provider: { chat },
      workDir: process.cwd(),
      identityContext: buildFinalResponseIdentityContext({
        config,
        originalRequest: "내 이름이 뭐니?",
        workDir: process.cwd(),
      }),
    })

    expect(result?.text).toBe("사용자 이름은 아직 확인되지 않았습니다.")
    expect(chat).toHaveBeenCalledTimes(1)
  })
})
