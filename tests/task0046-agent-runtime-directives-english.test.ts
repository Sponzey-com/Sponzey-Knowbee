import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const agentRuntime = createTestAgentRuntimeDependencies("test-runtime/task0046")

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
  loadKnowbeeMd: vi.fn(() => "legacy project memory"),
  loadPromptSourceRegistry: vi.fn(() => []),
  loadPromptTemplate: vi.fn((input: { sourceId?: string } = {}) => {
    if (input.sourceId === "reasoning_policy_runtime") {
      return "# Reasoning Runtime Policy\n\n[Reasoning Policy]\n\n- Use reasoning mode before acting."
    }
    if (input.sourceId === "web_access_policy_runtime") {
      return "# Web Access Runtime Policy\n\n[Web Access Policy]\n\n- Do not repeat web lookups."
    }
    return "# Test System Prompt\n\nYou are {{mainAgentName}}."
  }),
  loadBundledPromptTemplate: vi.fn(
    () => "# Web Access Contract\n\nUse only canonical web evidence.",
  ),
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

describe("task0046 agent runtime directives English normalization", () => {
  it("builds runtime system directives with English policy labels", async () => {
    let capturedSystem = ""
    let capturedMessages: Array<{ role: string; content: unknown }> = []
    const provider = {
      chat: vi.fn(async function* (params: { system?: string; messages?: Array<{ role: string; content: unknown }> }) {
        capturedSystem = params.system ?? ""
        capturedMessages = params.messages ?? []
        yield { type: "text_delta", delta: "Done." } as const
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
      userMessage: "check latest official docs",
      sessionId: "session-task0046-directives",
      runId: "run-task0046-directives",
      model: "llama3",
      providerId: "ollama",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
    })) {
      chunks.push(chunk)
    }

    expect(chunks).toContainEqual({ type: "text", delta: "Done.", textSource: "llm_generated" })
    expect(capturedSystem).toContain("[Reasoning Policy]")
    expect(capturedSystem).toContain("[Web Access Policy]")
    expect(capturedSystem).not.toContain("Project Memory")
    const externalDataMessage = capturedMessages.find((message) =>
      typeof message.content === "string" && message.content.includes('"role":"external_data"'),
    )
    expect(externalDataMessage?.role).toBe("user")
    expect(externalDataMessage?.content).toContain("Project Memory")
    expect(externalDataMessage?.content).toContain('"policyAuthority":"none"')
    expect(capturedSystem).not.toContain("[추론 정책]")
    expect(capturedSystem).not.toContain("[웹 접근 정책]")
    expect(capturedSystem).not.toContain("프로젝트 메모리")
    expect(capturedSystem).not.toContain("현재 실행 대상")
  })
})
