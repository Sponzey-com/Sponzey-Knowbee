import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"
import {
  buildAiErrorRecoveryPrompt,
  buildWorkerRuntimeErrorRecoveryPrompt,
} from "../packages/core/src/runs/recovery.ts"

const placeholders = [
  "{{originalRequest}}",
  "{{summary}}",
  "{{reason}}",
  "{{errorDetail}}",
  "{{failedRoute}}",
  "{{avoidTargets}}",
  "{{nextRouteHint}}",
  "{{previousResult}}",
]

describe("task0929 AI and worker runtime recovery prompt sources", () => {
  it("registers AI and worker recovery inputs as file-backed internal prompt sources", () => {
    const registry = loadPromptSourceRegistry(process.cwd())
    const ai = registry.find((item) => item.sourceId === "ai_error_recovery_user" && item.locale === "en")
    const worker = registry.find((item) => item.sourceId === "worker_runtime_error_recovery_user" && item.locale === "en")

    expect(ai).toMatchObject({ sourceId: "ai_error_recovery_user", usageScope: "internal", enabled: true })
    expect(worker).toMatchObject({ sourceId: "worker_runtime_error_recovery_user", usageScope: "internal", enabled: true })
    expect(ai?.path.endsWith("prompts/ai_error_recovery_user.md")).toBe(true)
    expect(worker?.path.endsWith("prompts/worker_runtime_error_recovery_user.md")).toBe(true)
    for (const placeholder of placeholders) {
      expect(ai?.content).toContain(placeholder)
      expect(worker?.content).toContain(placeholder)
    }
  })

  it("renders AI recovery evidence from runtime values", () => {
    const prompt = buildAiErrorRecoveryPrompt({
      originalRequest: "요약해줘",
      previousResult: "partial",
      summary: "AI call failed and needs strategy recovery.",
      reason: "rate limit",
      message: "429 too many requests",
      failedRoute: "OpenAI / openai / gpt-4o-mini",
      avoidTargets: ["rate-limit-window"],
      nextRouteHint: "Recover on the same AI connection and target.",
    })

    expect(prompt).toContain("[AI Error Recovery]")
    expect(prompt).toContain("Original user request:\n요약해줘")
    expect(prompt).toContain("Recovery summary:\nAI call failed and needs strategy recovery.")
    expect(prompt).toContain("Error analysis:\nrate limit")
    expect(prompt).toContain("Error detail:")
    expect(prompt).toContain("Failed approach: OpenAI / openai / gpt-4o-mini")
    expect(prompt).toContain("Avoid these targets:\n- rate-limit-window")
    expect(prompt).toContain("Preferred recovery route: Recover on the same AI connection and target.")
    expect(prompt).toContain("Previous result:\npartial")
  })

  it("renders worker runtime recovery evidence from runtime values", () => {
    const prompt = buildWorkerRuntimeErrorRecoveryPrompt({
      originalRequest: "작업해줘",
      previousResult: "partial",
      summary: "Worker runtime failed and needs fallback.",
      reason: "exit 1",
      message: "exited with code 1",
      failedRoute: "External worker / gpt-4o-mini",
      avoidTargets: [],
      nextRouteHint: "Recover on the same AI connection without the failed worker runtime.",
    })

    expect(prompt).toContain("[Worker Runtime Error Recovery]")
    expect(prompt).toContain("Original user request:\n작업해줘")
    expect(prompt).toContain("Recovery summary:\nWorker runtime failed and needs fallback.")
    expect(prompt).toContain("Error analysis:\nexit 1")
    expect(prompt).toContain("Failed approach: External worker / gpt-4o-mini")
    expect(prompt).toContain("Preferred recovery route: Recover on the same AI connection without the failed worker runtime.")
    expect(prompt).not.toContain("Avoid these targets:")
  })

  it("does not keep AI or worker recovery envelopes hardcoded in TypeScript", () => {
    const source = readFileSync("packages/core/src/runs/recovery.ts", "utf-8")

    expect(source).toContain('sourceId: "ai_error_recovery_user"')
    expect(source).toContain('sourceId: "worker_runtime_error_recovery_user"')
    expect(source).not.toContain("[AI Error Recovery]")
    expect(source).not.toContain("[Worker Runtime Error Recovery]")
    expect(source).not.toContain("이전 시도에서 모델 호출 중 오류가 발생했습니다.")
    expect(source).not.toContain("이전 시도에서 외부 작업 세션 실행이 실패했습니다.")
  })
})
