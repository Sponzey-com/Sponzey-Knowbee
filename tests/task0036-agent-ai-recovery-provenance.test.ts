import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const agentRuntime = createTestAgentRuntimeDependencies("test-runtime/task0036")

const appendRunEventMock = vi.fn()

vi.mock("../packages/core/src/runs/store.js", () => ({
  appendRunEvent: (...args: unknown[]) => appendRunEventMock(...args),
}))

vi.mock("../packages/core/src/db/index.js", () => ({
  getDb: () => ({
    prepare: () => ({ run: vi.fn() }),
  }),
  insertSession: vi.fn(),
  getSession: vi.fn(() => null),
  insertMessage: vi.fn(),
  getMessages: vi.fn(() => []),
  getMessagesForRequestGroup: vi.fn(() => []),
  getMessagesForRequestGroupWithRunMeta: vi.fn(() => []),
  getMessagesForRun: vi.fn(() => []),
  getPromptSourceStates: vi.fn(() => []),
  insertDiagnosticEvent: vi.fn(),
  insertMemoryItem: vi.fn(),
  markMessagesCompressed: vi.fn(),
  updateRunPromptSourceSnapshot: vi.fn(),
  upsertPromptSources: vi.fn(),
}))

vi.mock("../packages/core/src/memory/store.js", () => ({
  buildMemoryContext: vi.fn(async () => ""),
}))

vi.mock("../packages/core/src/memory/knowbee-md.js", () => ({
  loadKnowbeeMd: vi.fn(() => ""),
  loadPromptSourceRegistry: vi.fn(() => []),
  loadPromptTemplate: vi.fn(() => "# Test System Prompt\n\nYou are {{mainAgentName}}."),
  loadSystemPromptSourceAssembly: vi.fn(() => null),
}))

vi.mock("../packages/core/src/memory/prompt-fragments.js", () => ({
  loadPromptValue: vi.fn((_sourceId: string, variables: Record<string, unknown> = {}) => [
    "runtime_header=[Runtime]",
    `today_line=Today: ${String(variables["today"] ?? "")}`,
    "instruction_chain_header=[Instruction Chain]",
    "no_output=(no output)",
    "tool_failure_header=[Tool Failure]",
    "tool_label=Tool:",
    "error_label=Error:",
    "details_header=[Details]",
  ].join("\n")),
}))

vi.mock("../packages/core/src/instructions/merge.js", () => ({
  createInstructionRuntimeContext: vi.fn((stateDir: string) => ({
    globalStateDir: stateDir,
    fallbackBoundaryDir: stateDir,
  })),
  loadMergedInstructions: vi.fn(() => ({ mergedText: "" })),
}))

vi.mock("../packages/core/src/tools/runtime-dispatcher.js", () => ({
  toolDispatcher: {
    getAll: vi.fn(() => []),
    isToolAvailableForSource: () => true,
    dispatch: vi.fn(),
  },
}))

const { runAgent } = await import("../packages/core/src/agent/index.ts")

describe("task0036 agent AI recovery provenance", () => {
  it("records internal control events for AI recovery chunks", async () => {
    appendRunEventMock.mockClear()
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "이 텍스트는 유출되면 안 됩니다." } as const
        throw new Error("401 invalid api key")
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      ...agentRuntime,
      config: DEFAULT_CONFIG,
      userMessage: "상태 알려줘",
      sessionId: "session-ai-recovery-provenance",
      runId: "run-ai-recovery-provenance",
      model: "gpt-test",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toEqual([{
      type: "ai_recovery",
      summary: "AI 응답 생성 중 오류가 발생해 다른 방법을 다시 시도합니다.",
      reason: "인증 또는 접근 차단 문제 때문에 모델 호출이 실패했습니다.",
      message: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
    }])
    expect(JSON.stringify(chunks)).not.toContain("이 텍스트는 유출되면 안 됩니다.")
    expect(appendRunEventMock).toHaveBeenCalledWith(
      "run-ai-recovery-provenance",
      "internal_recovery_ai_payload_source:runtime_deterministic",
    )
    expect(appendRunEventMock).toHaveBeenCalledWith(
      "run-ai-recovery-provenance",
      "internal_recovery_ai_payload_delivery:control_flow_only",
    )
    expect(JSON.stringify(appendRunEventMock.mock.calls)).not.toContain(
      "user_facing_ai_recovery_rewrite_skipped",
    )
  })
})
