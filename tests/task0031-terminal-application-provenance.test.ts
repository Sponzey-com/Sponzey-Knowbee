import { describe, expect, it, vi } from "vitest"
import { applyTerminalApplication } from "../packages/core/src/runs/terminal-application.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
  }
}

describe("task0031 terminal application provenance", () => {
  it("records explicit terminal message source for awaiting_user applications", async () => {
    const dependencies = createFinalizationDependencies()
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    await applyTerminalApplication({
      runId: "run-terminal-awaiting",
      sessionId: "session-terminal-awaiting",
      source: "telegram",
      onChunk: undefined,
      application: {
        kind: "awaiting_user",
        preview: "",
        summary: "확인이 필요합니다.",
        userMessage: "어느 파일을 수정할까요?",
        userMessageSource: "llm_generated",
      },
      dependencies,
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-terminal-awaiting",
      "user_facing_terminal_message_source:awaiting_user:llm_generated",
    )
    expect(moveRunToAwaitingUser).toHaveBeenCalledWith(expect.objectContaining({
      textSource: "llm_generated",
    }))
  })

  it("records deterministic source when terminal message source is not provided", async () => {
    const dependencies = createFinalizationDependencies()
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    await applyTerminalApplication({
      runId: "run-terminal-stop",
      sessionId: "session-terminal-stop",
      source: "webui",
      onChunk: undefined,
      application: {
        kind: "stop",
        preview: "",
        summary: "자동 진행을 중단합니다.",
        reason: "복구 예산 소진",
      },
      dependencies,
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-terminal-stop",
      "user_facing_terminal_message_source:stop:runtime_deterministic",
    )
    expect(moveRunToCancelledAfterStop).toHaveBeenCalledWith(expect.objectContaining({
      textSource: "runtime_deterministic",
    }))
  })
})
