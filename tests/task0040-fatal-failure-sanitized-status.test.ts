import { describe, expect, it, vi } from "vitest"
import { applyFatalFailure } from "../packages/core/src/runs/failure-application.ts"

function createDependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunFailure: vi.fn(),
    markAbortedRunCancelledIfActive: vi.fn(),
  }
}

describe("task0040 fatal failure user-facing sanitization", () => {
  it("stores sanitized user-facing failure text instead of raw provider errors", () => {
    const dependencies = createDependencies()
    const rawMessage = [
      "401 invalid api key: sk-test-secret",
      "    at requestModel (/Users/me/private/runtime.ts:12:3)",
    ].join("\n")

    const result = applyFatalFailure({
      runId: "run-sanitized-1",
      sessionId: "session-sanitized-1",
      source: "telegram",
      message: rawMessage,
      aborted: false,
      summary: "실행 중 오류로 요청이 중단되었습니다.",
      title: "run_error",
      extraEvents: ["worker-session 실행 실패"],
    }, dependencies)

    const userMessage = "인증 또는 접근 차단 문제로 요청이 실패했습니다."

    expect(result).toBe("failed")
    expect(dependencies.appendRunEvent).toHaveBeenNthCalledWith(1, "run-sanitized-1", userMessage)
    expect(dependencies.appendRunEvent).toHaveBeenNthCalledWith(2, "run-sanitized-1", "worker-session 실행 실패")
    expect(dependencies.setRunStepStatus).toHaveBeenCalledWith("run-sanitized-1", "executing", "failed", userMessage)
    expect(dependencies.updateRunStatus).toHaveBeenCalledWith("run-sanitized-1", "failed", userMessage, false)
    expect(dependencies.rememberRunFailure).toHaveBeenCalledWith({
      runId: "run-sanitized-1",
      sessionId: "session-sanitized-1",
      source: "telegram",
      summary: "실행 중 오류로 요청이 중단되었습니다.",
      detail: userMessage,
      title: "run_error",
    })

    const serializedCalls = JSON.stringify({
      events: dependencies.appendRunEvent.mock.calls,
      step: dependencies.setRunStepStatus.mock.calls,
      status: dependencies.updateRunStatus.mock.calls,
      failure: dependencies.rememberRunFailure.mock.calls,
    })
    expect(serializedCalls).not.toContain("sk-test-secret")
    expect(serializedCalls).not.toContain("/Users/me/private")
  })

  it("sanitizes retained abort-time failure events while preserving extra events", () => {
    const dependencies = createDependencies()
    const rawMessage = "401 invalid api key: sk-abort-secret"

    const result = applyFatalFailure({
      runId: "run-sanitized-2",
      sessionId: "session-sanitized-2",
      source: "cli",
      message: rawMessage,
      aborted: true,
      summary: "실행 중 오류로 요청이 중단되었습니다.",
      title: "run_error",
      extraEvents: ["worker-123 실행 실패"],
      appendMessageEventOnAbort: true,
      appendExtraEventsOnAbort: true,
    }, dependencies)

    expect(result).toBe("cancelled")
    expect(dependencies.appendRunEvent).toHaveBeenNthCalledWith(1, "run-sanitized-2", "인증 또는 접근 차단 문제로 요청이 실패했습니다.")
    expect(dependencies.appendRunEvent).toHaveBeenNthCalledWith(2, "run-sanitized-2", "worker-123 실행 실패")
    expect(dependencies.markAbortedRunCancelledIfActive).toHaveBeenCalledWith("run-sanitized-2")
    expect(dependencies.setRunStepStatus).not.toHaveBeenCalled()
    expect(dependencies.updateRunStatus).not.toHaveBeenCalled()
    expect(dependencies.rememberRunFailure).not.toHaveBeenCalled()

    const serializedCalls = JSON.stringify(dependencies.appendRunEvent.mock.calls)
    expect(serializedCalls).not.toContain("sk-abort-secret")
  })
})
