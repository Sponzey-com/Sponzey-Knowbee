import { describe, expect, it, vi } from "vitest"
import { applyTerminalApplication } from "../packages/core/src/runs/terminal-application.ts"
import { buildTerminalControlNotice } from "../packages/core/src/runs/terminal-control-notice.ts"

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

describe("task0810 terminal application control notice", () => {
  it("builds non-final terminal control notice metadata", () => {
    expect(buildTerminalControlNotice({
      terminalKind: "awaiting_user",
      messageSource: "llm_generated",
    })).toEqual({
      kind: "terminal_control",
      terminalKind: "awaiting_user",
      messageSource: "llm_generated",
      deliveryMode: "control",
      textSource: "terminal_control_notice",
      renderingRequired: "llm_final_response",
      contentKind: "fixed_notice",
      finalAnswer: false,
      assistantIdentityClaim: false,
    })
  })

  it("records awaiting_user terminal control notice provenance", async () => {
    const dependencies = createFinalizationDependencies()
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    await applyTerminalApplication({
      runId: "run-terminal-awaiting-notice",
      sessionId: "session-terminal-awaiting-notice",
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
      "run-terminal-awaiting-notice",
      "user_facing_terminal_notice:terminal_control_notice:awaiting_user:non_final",
    )
    expect(moveRunToAwaitingUser).toHaveBeenCalledWith(expect.objectContaining({
      textSource: "llm_generated",
    }))
  })

  it("records stop terminal control notice provenance", async () => {
    const dependencies = createFinalizationDependencies()
    const moveRunToAwaitingUser = vi.fn(async () => {})
    const moveRunToCancelledAfterStop = vi.fn(async () => {})

    await applyTerminalApplication({
      runId: "run-terminal-stop-notice",
      sessionId: "session-terminal-stop-notice",
      source: "webui",
      onChunk: undefined,
      application: {
        kind: "stop",
        preview: "",
        summary: "자동 진행을 중단합니다.",
      },
      dependencies,
    }, {
      moveRunToAwaitingUser,
      moveRunToCancelledAfterStop,
    })

    expect(dependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-terminal-stop-notice",
      "user_facing_terminal_notice:terminal_control_notice:stop:non_final",
    )
    expect(moveRunToCancelledAfterStop).toHaveBeenCalledWith(expect.objectContaining({
      textSource: "runtime_deterministic",
    }))
  })
})
