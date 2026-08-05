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
    applyTerminalApplication: vi.fn().mockResolvedValue("awaiting_user"),
    renderFinalResponseText: overrides.renderFinalResponseText ?? vi.fn(),
  }
}

describe("task0030 awaiting user final response rewrite", () => {
  it("rewrites deterministic awaiting_user message through final response renderer", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "수정할 파일명을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-awaiting-rewrite",
      sessionId: "session-awaiting-rewrite",
      source: "telegram",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "추가 입력 필요",
        userMessage: "대상을 지정해 주세요.",
        userMessageSource: "runtime_deterministic",
        remainingItems: ["수정할 파일명"],
      },
      responseContext: {
        originalRequest: "이 파일 수정해줘",
        responseLanguageMode: "translation",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "이 파일 수정해줘",
      responseLanguageMode: "translation",
      rawText: "대상을 지정해 주세요.\n\n남은 항목:\n- 수정할 파일명",
      textSource: "runtime_deterministic",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-rewrite",
      "user_facing_awaiting_user_rewritten:llm",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      responseContext: {
        originalRequest: "이 파일 수정해줘",
        responseLanguageMode: "translation",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      application: expect.objectContaining({
        userMessage: "수정할 파일명을 알려 주세요.",
        userMessageSource: "llm_reviewed",
        remainingItems: ["수정할 파일명"],
      }),
    }))
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-rewrite",
      "user_facing_awaiting_user_message_source:llm_reviewed",
    )
  })

  it("rewrites LLM-generated awaiting_user message through final response renderer", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "수정할 파일을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-awaiting-llm",
      sessionId: "session-awaiting-llm",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "확인이 필요합니다.",
        userMessage: "어느 파일을 수정할까요?",
        userMessageSource: "llm_generated",
      },
      responseContext: {
        originalRequest: "파일 수정해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "파일 수정해줘",
      rawText: "어느 파일을 수정할까요?",
      textSource: "llm_generated",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-llm",
      "user_facing_awaiting_user_rewritten:llm",
    )
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-llm",
      "user_facing_awaiting_user_provenance:llm_reviewed:final_response:llm_generated",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      responseContext: {
        originalRequest: "파일 수정해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      application: expect.objectContaining({
        userMessage: "수정할 파일을 알려 주세요.",
        userMessageSource: "llm_reviewed",
      }),
    }))
  })

  it("rewrites LLM-generated awaiting_user message when runtime fields are appended", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "수정할 파일명을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-awaiting-llm-mixed",
      sessionId: "session-awaiting-llm-mixed",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "확인이 필요합니다.",
        userMessage: "어느 파일을 수정할까요?",
        userMessageSource: "llm_generated",
        remainingItems: ["수정할 파일명"],
      },
      responseContext: {
        originalRequest: "파일 수정해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "파일 수정해줘",
      rawText: "어느 파일을 수정할까요?\n\n남은 항목:\n- 수정할 파일명",
      textSource: "mixed",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        userMessage: "수정할 파일명을 알려 주세요.",
        userMessageSource: "llm_reviewed",
        remainingItems: ["수정할 파일명"],
      }),
    }))
  })

  it("rewrites LLM-reviewed awaiting_user message when runtime fields are appended", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn().mockResolvedValue({
      text: "수정할 파일명을 알려 주세요.",
    })
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-awaiting-reviewed-mixed",
      sessionId: "session-awaiting-reviewed-mixed",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "확인이 필요합니다.",
        userMessage: "어느 파일을 수정할까요?",
        userMessageSource: "llm_reviewed",
        remainingItems: ["수정할 파일명"],
      },
      responseContext: {
        originalRequest: "파일 수정해줘",
        model: "gpt-test",
        providerId: "openai",
        workDir: "/tmp/project",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).toHaveBeenCalledWith({
      originalRequest: "파일 수정해줘",
      rawText: "어느 파일을 수정할까요?\n\n남은 항목:\n- 수정할 파일명",
      textSource: "mixed",
      model: "gpt-test",
      providerId: "openai",
      workDir: "/tmp/project",
    })
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        userMessage: "수정할 파일명을 알려 주세요.",
        userMessageSource: "llm_reviewed",
        remainingItems: ["수정할 파일명"],
      }),
    }))
  })

  it("does not forward deterministic awaiting_user message when response context is missing", async () => {
    const finalizationDependencies = createFinalizationDependencies()
    const renderFinalResponseText = vi.fn()
    const moduleDependencies = createModuleDependencies({ renderFinalResponseText })

    await applyLoopDirective({
      runId: "run-awaiting-missing-context",
      sessionId: "session-awaiting-missing-context",
      source: "webui",
      onChunk: undefined,
      directive: {
        kind: "awaiting_user",
        preview: "",
        summary: "추가 입력 필요",
        userMessage: "대상을 지정해 주세요.",
        userMessageSource: "runtime_deterministic",
      },
      finalizationDependencies,
    }, moduleDependencies)

    expect(renderFinalResponseText).not.toHaveBeenCalled()
    expect(finalizationDependencies.appendRunEvent).toHaveBeenCalledWith(
      "run-awaiting-missing-context",
      "user_facing_awaiting_user_rewrite_blocked:missing_context",
    )
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.objectContaining({
        userMessageSource: "runtime_deterministic",
      }),
    }))
    expect(moduleDependencies.applyTerminalApplication).toHaveBeenCalledWith(expect.objectContaining({
      application: expect.not.objectContaining({
        userMessage: "대상을 지정해 주세요.",
      }),
    }))
  })
})
