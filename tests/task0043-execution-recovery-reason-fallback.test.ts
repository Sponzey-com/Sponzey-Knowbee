import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const agentRuntime = createTestAgentRuntimeDependencies("test-runtime/task0043")

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
  loadBundledPromptTemplate: vi.fn(() => ""),
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

describe("task0043 execution recovery reason fallback", () => {
  it("does not use raw tool error as execution recovery reason when no classifier matches", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "screen_capture",
      description: "screen capture",
      parameters: { type: "object", properties: {} },
    }])

    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: "remote execution failed without a known classifier",
      error: "INTERNAL_SECRET_CODE sk-execution-secret /Users/me/private/capture.ts",
    })

    const provider = {
      chat: vi.fn()
        .mockImplementationOnce(async function* () {
          yield {
            type: "tool_use",
            id: "tool-execution-recovery",
            name: "screen_capture",
            input: {},
          } as const
          yield {
            type: "message_stop",
            usage: { input_tokens: 1, output_tokens: 1 },
          } as const
        })
        .mockImplementationOnce(async function* () {
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
      userMessage: "화면 캡처해줘",
      sessionId: "session-task0043-execution-recovery",
      runId: "run-task0043-execution-recovery",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toContainEqual({
      type: "execution_recovery",
      toolNames: ["screen_capture"],
      summary: "screen_capture 실패 원인을 분석하고 다른 방법을 다시 시도합니다.",
      reason: "작업 실행이 실패해 다른 방법 검토가 필요합니다.",
    })

    const executionRecoveryChunks = chunks.filter((chunk) => chunk.type === "execution_recovery")
    expect(JSON.stringify(executionRecoveryChunks)).not.toContain("sk-execution-secret")
    expect(JSON.stringify(executionRecoveryChunks)).not.toContain("/Users/me/private")
  })
})
