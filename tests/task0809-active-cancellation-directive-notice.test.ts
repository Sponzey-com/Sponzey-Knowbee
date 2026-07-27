import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { buildActiveQueueCancellationNotice } from "../packages/core/src/runs/active-cancellation-notice.ts"
import { applyLoopDirective } from "../packages/core/src/runs/loop-directive-application.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
  }
}

describe("task0809 active cancellation directive notice", () => {
  it("builds non-final active cancellation control notice metadata", () => {
    expect(buildActiveQueueCancellationNotice({
      mode: "latest",
      hadTargets: true,
      cancelledCount: 1.8,
      remainingCount: 2.2,
    })).toEqual({
      kind: "active_queue_cancellation",
      mode: "latest",
      hadTargets: true,
      cancelledCount: 1,
      remainingCount: 2,
      deliveryMode: "control",
      textSource: "active_queue_cancellation_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("records loop directive notice provenance before finalizing complete directive", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const moduleDependencies = {
      completeRunWithAssistantMessage: vi.fn().mockResolvedValue(undefined),
      markRunCompleted: vi.fn(),
      applyTerminalApplication: vi.fn(),
    }

    await applyLoopDirective({
      runId: "run-active-cancel-notice",
      sessionId: "session-active-cancel-notice",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "complete",
        text: "현재 대화에서 가장 최근 활성 작업 1건을 취소했습니다.",
        textSource: "runtime_deterministic",
        notice: buildActiveQueueCancellationNotice({
          mode: "latest",
          hadTargets: true,
          cancelledCount: 1,
          remainingCount: 0,
        }),
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-active-cancel-notice",
      "user_facing_loop_directive_notice:active_queue_cancellation_notice:non_final",
    )
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-active-cancel-notice",
      "user_facing_text_source:runtime_deterministic",
    )
  })

  it("routes active queue cancellation directives through the notice builder", () => {
    const source = readFileSync(join(process.cwd(), "packages/core/src/runs/start-support.ts"), "utf-8")

    expect(source).toContain("buildActiveQueueCancellationNotice")
    expect(source).toContain("notice: buildActiveQueueCancellationNotice")
  })
})
