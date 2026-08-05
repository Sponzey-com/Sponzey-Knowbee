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

function createModuleDependencies(overrides: {
  renderFinalResponseText?: ReturnType<typeof vi.fn>
} = {}) {
  return {
    completeRunWithAssistantMessage: vi.fn(),
    markRunCompleted: vi.fn(),
    applyTerminalApplication: vi.fn().mockResolvedValue("cancelled"),
    renderFinalResponseText: overrides.renderFinalResponseText ?? vi.fn(),
  }
}

describe("task0663 stop directive final response rewrite parity", () => {
  it("rewrites deterministic stop messages through the final response renderer", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "현재 정보로는 요청을 처리할 수 없습니다. 필요한 정보를 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-stop-rewrite",
      sessionId: "session-stop-rewrite",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "stop",
        preview: "",
        summary: "요청을 처리할 수 없습니다.",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
        userMessageSource: "runtime_deterministic",
      },
      responseContext: {
        originalRequest: "이거 해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "이거 해줘",
      rawText: "현재 정보로는 요청을 처리할 수 없습니다.",
      textSource: "runtime_deterministic",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-rewrite",
      "user_facing_stop_rewritten:llm",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "stop",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다. 필요한 정보를 알려 주세요.",
        userMessageSource: "llm_reviewed",
      }),
    }))
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-rewrite",
      "user_facing_stop_message_source:llm_reviewed",
    )
  })

  it("does not forward deterministic stop messages when response context is missing", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn()
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-stop-missing-context",
      sessionId: "session-stop-missing-context",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "stop",
        preview: "",
        summary: "요청을 처리할 수 없습니다.",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
        userMessageSource: "runtime_deterministic",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-missing-context",
      "user_facing_stop_rewrite_blocked:missing_context",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "stop",
        userMessageSource: "runtime_deterministic",
      }),
    }))
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.not.objectContaining({
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
      }),
    }))
  })

  it("rewrites LLM-generated stop messages through the final response renderer", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "현재 정보로는 요청을 처리할 수 없습니다. 처리 대상을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-stop-llm",
      sessionId: "session-stop-llm",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "stop",
        preview: "",
        summary: "요청을 처리할 수 없습니다.",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
        userMessageSource: "llm_generated",
      },
      responseContext: {
        originalRequest: "상태 알려줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "상태 알려줘",
      rawText: "현재 정보로는 요청을 처리할 수 없습니다.",
      textSource: "llm_generated",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-llm",
      "user_facing_stop_rewritten:llm",
    )
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-stop-llm",
      "user_facing_stop_provenance:llm_reviewed:final_response:llm_generated",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "stop",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다. 처리 대상을 알려 주세요.",
        userMessageSource: "llm_reviewed",
      }),
    }))
  })

  it("rewrites LLM-generated stop messages when runtime fields are appended", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "현재 정보로는 요청을 처리할 수 없습니다. 다른 대상을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-stop-llm-mixed",
      sessionId: "session-stop-llm-mixed",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "stop",
        preview: "",
        summary: "요청을 처리할 수 없습니다.",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
        userMessageSource: "llm_generated",
        reason: "대상이 모호합니다.",
        remainingItems: ["대상 확인"],
      },
      responseContext: {
        originalRequest: "이거 처리해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "이거 처리해줘",
      rawText: [
        "현재 정보로는 요청을 처리할 수 없습니다.",
        "",
        "남은 항목:\n- 대상 확인",
        "",
        "중단 사유: 대상이 모호합니다.",
      ].join("\n"),
      textSource: "mixed",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "stop",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다. 다른 대상을 알려 주세요.",
        userMessageSource: "llm_reviewed",
      }),
    }))
  })

  it("rewrites LLM-reviewed stop messages when runtime fields are appended", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "현재 정보로는 요청을 처리할 수 없습니다. 다른 대상을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-stop-reviewed-mixed",
      sessionId: "session-stop-reviewed-mixed",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "stop",
        preview: "",
        summary: "요청을 처리할 수 없습니다.",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다.",
        userMessageSource: "llm_reviewed",
        reason: "대상이 모호합니다.",
      },
      responseContext: {
        originalRequest: "이거 처리해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "이거 처리해줘",
      rawText: [
        "현재 정보로는 요청을 처리할 수 없습니다.",
        "",
        "중단 사유: 대상이 모호합니다.",
      ].join("\n"),
      textSource: "mixed",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        kind: "stop",
        userMessage: "현재 정보로는 요청을 처리할 수 없습니다. 다른 대상을 알려 주세요.",
        userMessageSource: "llm_reviewed",
      }),
    }))
  })
})
