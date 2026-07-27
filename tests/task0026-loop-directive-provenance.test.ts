import { describe, expect, it, vi } from "vitest"
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

describe("task0026 loop directive provenance", () => {
  it("records the user-facing text source before completing a directive", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const moduleDependencies = {
      completeRunWithAssistantMessage: vi.fn().mockResolvedValue(undefined),
      markRunCompleted: vi.fn(),
      applyTerminalApplication: vi.fn(),
    }

    await applyLoopDirective({
      runId: "run-provenance",
      sessionId: "session-provenance",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "complete",
        text: "완료했습니다.",
        textSource: "llm_generated",
        eventLabel: "완료 전달",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(finalizationDependencies.appendRunEvent).toHaveBeenNthCalledWith(
      1,
      "run-provenance",
      "완료 전달",
    )
    expect(finalizationDependencies.appendRunEvent).toHaveBeenNthCalledWith(
      2,
      "run-provenance",
      "user_facing_text_source:llm_generated",
    )
    expect(moduleDependencies.completeRunWithAssistantMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: "완료했습니다.",
    }))
  })
})
