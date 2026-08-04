import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const agentRuntime = createTestAgentRuntimeDependencies("test-runtime/task0042")

const getAllMock = vi.fn(() => [])
const dispatchMock = vi.fn()
const getMessagesForRunMock = vi.fn(() => [])
const buildMemoryContextMock = vi.fn(async () => "")

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
  getMessagesForRun: (...args: unknown[]) => getMessagesForRunMock(...args),
  getPromptSourceStates: vi.fn(() => []),
  insertDiagnosticEvent: vi.fn(),
  insertMemoryItem: vi.fn(),
  markMessagesCompressed: vi.fn(),
  updateRunPromptSourceSnapshot: vi.fn(),
  upsertPromptSources: vi.fn(),
}))

vi.mock("../packages/core/src/memory/store.js", () => ({
  buildMemoryContext: (...args: unknown[]) => buildMemoryContextMock(...args),
}))

vi.mock("../packages/core/src/memory/knowbee-md.js", () => ({
  loadKnowbeeMd: vi.fn(() => ""),
  loadBundledPromptTemplate: vi.fn(() => "# Test Bundled Prompt"),
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
    getAll: (...args: unknown[]) => getAllMock(...args),
    isToolAvailableForSource: () => true,
    dispatch: (...args: unknown[]) => dispatchMock(...args),
  },
}))

const { runAgent } = await import("../packages/core/src/agent/index.ts")

describe("task0042 terminal failure text gate", () => {
  it("does not emit arbitrary stopAfterFailure tool output as final text", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "unsafe_terminal_tool",
      description: "unsafe terminal failure",
      parameters: { type: "object", properties: {} },
    }])

    const rawOutput = [
      "401 invalid api key: sk-terminal-secret",
      "    at unsafeTool (/Users/me/private/tool.ts:12:3)",
    ].join("\n")

    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: rawOutput,
      error: "UNSAFE_TERMINAL_FAILURE",
      details: {
        stopAfterFailure: true,
      },
    })

    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "tool-terminal-failure",
          name: "unsafe_terminal_tool",
          input: {},
        } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      ...agentRuntime,
      config: DEFAULT_CONFIG,
      userMessage: "위험한 도구 실행",
      sessionId: "session-task0042-terminal-failure",
      runId: "run-task0042-terminal-failure",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toContainEqual(expect.objectContaining({
      type: "text",
      delta: "인증 또는 접근 차단 문제로 요청이 실패했습니다.",
      textSource: "runtime_deterministic",
      notice: expect.objectContaining({
        kind: "agent_terminal_failure",
        toolName: "unsafe_terminal_tool",
        failureTrust: "sanitized_tool_failure",
        textSource: "agent_terminal_failure_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
      }),
    }))
    const textChunks = chunks.filter((chunk) => chunk.type === "text")
    expect(textChunks).toHaveLength(1)
    expect(JSON.stringify(textChunks)).not.toContain("sk-terminal-secret")
    expect(JSON.stringify(textChunks)).not.toContain("/Users/me/private")
  })
})
