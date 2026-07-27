import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.js"
import { buildYeonjangEvidenceEnvelope } from "../packages/core/src/yeonjang/evidence.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"

const agentRuntime = createTestAgentRuntimeDependencies("test-runtime/task021")
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

describe("task021 Yeonjang failure recovery event integration", () => {
  it("uses failed Yeonjang evidence as execution recovery reason without raw payload leakage", async () => {
    getAllMock.mockReturnValueOnce([{
      name: "yeonjang_camera_capture",
      description: "capture camera",
      parameters: { type: "object", properties: {} },
    }])

    dispatchMock.mockResolvedValueOnce({
      success: false,
      output: "raw camera transport output do-not-project-output",
      error: "raw camera error do-not-project-error",
      details: {
        via: "yeonjang",
        base64_data: "do-not-project-base64",
        evidence: buildYeonjangEvidenceEnvelope({
          targetRef: "yeonjang-main",
          toolName: "yeonjang_camera_capture",
          methodIds: ["camera.capture"],
          group: "camera",
          riskLevel: "moderate",
          requiresApproval: true,
          summary: "camera capture artifact missing",
          postCheck: {
            kind: "failed",
            verified: false,
            exists: false,
            reason: "artifact_missing",
          },
          collectedAt: 123,
        }),
      },
      evidenceSource: {
        sourceKind: "yeonjang",
        sourceRef: `tool-result:yeonjang:${"c".repeat(64)}`,
        trustClass: "untrusted_external",
        instructionIsolation: "data_only",
      },
    })

    const provider = {
      chat: vi.fn()
        .mockImplementationOnce(async function* () {
          yield {
            type: "tool_use",
            id: "tool-yeonjang-camera-failed",
            name: "yeonjang_camera_capture",
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
      userMessage: "카메라로 사진 찍어줘",
      sessionId: "session-task021-yeonjang-recovery",
      runId: "run-task021-yeonjang-recovery",
      model: "gpt-5",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: true,
    })) {
      chunks.push(chunk)
    }

    const recovery = chunks.find((chunk) => chunk.type === "execution_recovery")
    expect(recovery).toMatchObject({
      type: "execution_recovery",
      toolNames: ["yeonjang_camera_capture"],
      summary: "yeonjang_camera_capture Yeonjang evidence failed verification.",
    })
    expect(JSON.stringify(recovery)).toContain("target=yeonjang-main")
    expect(JSON.stringify(recovery)).toContain("method=camera.capture")
    expect(JSON.stringify(recovery)).toContain("post_check=failed")
    expect(JSON.stringify(recovery)).not.toContain("do-not-project")
  })
})
