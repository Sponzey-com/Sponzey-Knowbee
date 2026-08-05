import { describe, expect, it, vi } from "vitest"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { applyLoopDirective } from "../packages/core/src/runs/loop-directive-application.ts"

function createFinalizationDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
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

function createLoopModuleDependencies(renderFinalResponseText: ReturnType<typeof vi.fn>) {
  return {
    completeRunWithAssistantMessage,
    markRunCompleted: vi.fn(),
    applyTerminalApplication: vi.fn().mockResolvedValue(undefined),
    renderFinalResponseText,
  }
}

function joinedRunEvents(appendRunEvent: ReturnType<typeof vi.fn>): string {
  return appendRunEvent.mock.calls.map((call) => String(call[1])).join("\n")
}

describe("task0579 final response rewrite error redaction", () => {
  it("redacts finalization renderer errors before run events and failure records", async () => {
    const dependencies = createFinalizationDependencies()
    const secret = "sk-task0579-finalization-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/final-response-secret.txt"
    const renderFinalResponseText = vi
      .fn()
      .mockRejectedValue(new Error(`provider failed token=${secret} path=${localPath}`))

    const outcome = await completeRunWithAssistantMessage({
      runId: "run-finalization-redaction",
      sessionId: "session-finalization-redaction",
      text: "완료했습니다.",
      textSource: "runtime_deterministic",
      responseContext: {
        originalRequest: "정리해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    const events = joinedRunEvents(dependencies.appendRunEvent)
    const failureRecord = JSON.stringify(dependencies.rememberRunFailure.mock.calls[0]?.[0] ?? {})
    expect(outcome.status).toBe("blocked_by_final_response_rendering")
    expect(events).toContain("user_facing_completion_rewrite_blocked:error:")
    expect(events).toContain("token=***")
    expect(events).toContain("[internal-path-redacted]")
    expect(failureRecord).toContain("token=***")
    expect(failureRecord).toContain("[internal-path-redacted]")
    expect(`${events}\n${failureRecord}`).not.toContain(secret)
    expect(`${events}\n${failureRecord}`).not.toContain(localPath)
  })

  it("redacts loop complete renderer errors at the finalization owner", async () => {
    const dependencies = createFinalizationDependencies()
    const secret = "sk-task0579-loop-complete-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/loop-complete-secret.txt"
    const renderFinalResponseText = vi
      .fn()
      .mockRejectedValue(new Error(`provider failed token=${secret} path=${localPath}`))

    await applyLoopDirective(
      {
        runId: "run-loop-complete-redaction",
        sessionId: "session-loop-complete-redaction",
        source: "webui",
        onChunk: undefined,
        directive: {
          kind: "complete",
          text: "완료했습니다.",
          textSource: "runtime_deterministic",
        },
        responseContext: {
          originalRequest: "처리해줘",
          model: "gpt-test",
          providerId: "openai",
          workDir: "/tmp/project",
        },
        finalizationDependencies: dependencies,
      },
      createLoopModuleDependencies(renderFinalResponseText),
    )

    const events = joinedRunEvents(dependencies.appendRunEvent)
    expect(events).toContain("user_facing_completion_rewrite_blocked:error:")
    expect(events).toContain("token=***")
    expect(events).toContain("[internal-path-redacted]")
    expect(events).not.toContain(secret)
    expect(events).not.toContain(localPath)
  })

  it("redacts loop awaiting-user renderer errors before run events", async () => {
    const dependencies = createFinalizationDependencies()
    const secret = "sk-task0579-loop-awaiting-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/loop-awaiting-secret.txt"
    const renderFinalResponseText = vi
      .fn()
      .mockRejectedValue(new Error(`provider failed token=${secret} path=${localPath}`))

    await applyLoopDirective(
      {
        runId: "run-loop-awaiting-redaction",
        sessionId: "session-loop-awaiting-redaction",
        source: "telegram",
        onChunk: undefined,
        directive: {
          kind: "awaiting_user",
          preview: "",
          summary: "추가 입력 필요",
          userMessage: "대상을 지정해 주세요.",
          userMessageSource: "runtime_deterministic",
        },
        responseContext: {
          originalRequest: "파일 수정해줘",
          model: "gpt-test",
          providerId: "openai",
          workDir: "/tmp/project",
        },
        finalizationDependencies: dependencies,
      },
      createLoopModuleDependencies(renderFinalResponseText),
    )

    const events = joinedRunEvents(dependencies.appendRunEvent)
    expect(events).toContain("user_facing_awaiting_user_rewrite_blocked:error:")
    expect(events).toContain("token=***")
    expect(events).toContain("[internal-path-redacted]")
    expect(events).not.toContain(secret)
    expect(events).not.toContain(localPath)
  })
})
