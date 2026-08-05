import { describe, expect, it, vi } from "vitest"
import { executeStartLoopDirective } from "../packages/core/src/runs/start-bridges.ts"
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

describe("task0027 loop directive response context", () => {
  it("records when complete directive finalization has final response context", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const moduleDependencies = {
      completeRunWithAssistantMessage: vi.fn().mockResolvedValue(undefined),
      markRunCompleted: vi.fn(),
      applyTerminalApplication: vi.fn(),
    }

    await applyLoopDirective({
      runId: "run-context",
      sessionId: "session-context",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "complete",
        text: "예약했습니다.",
        textSource: "runtime_deterministic",
      },
      responseContext: {
        originalRequest: "내일 알려줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-context",
      "user_facing_response_context:available",
    )
  })

  it("passes response context through the start bridge", async () => {
    const applyLoopDirectiveMock = vi.fn(async () => "break" as const)
    const finalizationDependencies = createFinalizationDependencies()

    await executeStartLoopDirective({
      runId: "run-start-context",
      sessionId: "session-start-context",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "complete",
        text: "ok",
        textSource: "llm_generated",
      },
      responseContext: {
        originalRequest: "hello",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, {
      applyLoopDirective: applyLoopDirectiveMock as never,
      runIntakeBridgePass: vi.fn() as never,
    })

    expect(applyLoopDirectiveMock).toHaveBeenCalledWith(expect.objectContaining({
      responseContext: {
        originalRequest: "hello",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
    }))
  })
})
