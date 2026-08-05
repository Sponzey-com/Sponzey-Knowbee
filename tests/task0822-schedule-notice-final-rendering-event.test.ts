import { describe, expect, it, vi } from "vitest"
import { applyLoopDirective } from "../packages/core/src/runs/loop-directive-application.ts"
import { buildScheduleActionResultNotice } from "../packages/core/src/runs/schedule-action-notice.ts"

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

describe("task0822 schedule notice final rendering event", () => {
  it("records schedule action notice and rewrites deterministic schedule result", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "예약을 저장했습니다. 매 분마다 요청한 메시지를 보냅니다.",
    })
    const moduleDependencies = {
      completeRunWithAssistantMessage: vi.fn().mockResolvedValue(undefined),
      markRunCompleted: vi.fn(),
      applyTerminalApplication: vi.fn(),
      renderFinalResponseText,
    }

    await applyLoopDirective({
      runId: "run-schedule-notice-render",
      sessionId: "session-schedule-notice-render",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "complete",
        text: "스케줄이 저장되었습니다.",
        textSource: "runtime_deterministic",
        notice: buildScheduleActionResultNotice({
          ok: true,
          actionCount: 1,
          successCount: 1,
          failureCount: 0,
        }),
      },
      responseContext: {
        originalRequest: "매 분 안녕이라고 해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-schedule-notice-render",
      "user_facing_loop_directive_notice:schedule_action_result_notice:non_final",
    )
    expect(moduleDependencies.completeRunWithAssistantMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "스케줄이 저장되었습니다.",
        textSource: "runtime_deterministic",
        responseContext: expect.objectContaining({ originalRequest: "매 분 안녕이라고 해줘" }),
        renderFinalResponseText,
      }),
    )
  })
})
