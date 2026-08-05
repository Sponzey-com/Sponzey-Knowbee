import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { emitStandaloneAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { buildStartPreflightFailureNotice } from "../packages/core/src/runs/start-preflight-notice.ts"

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    onDeliveryError: vi.fn(),
    deliveryDependencies: {
      now: () => 0,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

describe("task0808 start preflight standalone notice", () => {
  it("builds start preflight failure notice metadata", () => {
    expect(buildStartPreflightFailureNotice({
      code: "ai_connection_unavailable",
      summary: "AI connection is not ready.",
      userMessage: "AI 연결을 먼저 설정해야 합니다.",
      eventLabel: "preflight_failed: ai_connection_unavailable",
    })).toEqual({
      kind: "start_preflight_failure",
      code: "ai_connection_unavailable",
      summary: "AI connection is not ready.",
      deliveryMode: "diagnostic",
      textSource: "start_preflight_failure_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("records standalone notice metadata before delivery resolution", async () => {
    const dependencies = createDependencies()

    await emitStandaloneAssistantMessage({
      runId: "run-preflight-notice",
      sessionId: "session-preflight-notice",
      text: "AI 연결을 먼저 설정해야 합니다.",
      textSource: "runtime_deterministic",
      notice: buildStartPreflightFailureNotice({
        code: "ai_connection_unavailable",
        summary: "AI connection is not ready.",
        userMessage: "AI 연결을 먼저 설정해야 합니다.",
        eventLabel: "preflight_failed: ai_connection_unavailable",
      }),
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-preflight-notice",
      "user_facing_standalone_notice:start_preflight_failure_notice:non_final",
    )
  })

  it("routes start preflight failures through the notice builder", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/runs/start.ts"), "utf-8")

    expect(source).toContain("buildStartPreflightFailureNotice")
    expect(source).toContain("notice: buildStartPreflightFailureNotice(params.failure)")
  })
})
