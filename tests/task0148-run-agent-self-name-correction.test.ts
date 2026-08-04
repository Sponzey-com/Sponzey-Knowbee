import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { KnowbeeConfig } from "../packages/core/src/config/types.ts"
import {
  createTestAgentRuntimeDependencies,
  type TestAgentRuntimeDependencies,
} from "./fixtures/agent-runtime.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(() => []),
  dispatch: vi.fn(),
  getMessagesForRun: vi.fn(() => []),
  buildMemoryContext: vi.fn(async () => ""),
  insertMessage: vi.fn(),
}))

vi.mock("../packages/core/src/db/index.js", () => ({
  getDb: () => ({
    prepare: () => ({ run: vi.fn() }),
  }),
  insertSession: vi.fn(),
  getSession: vi.fn(() => null),
  insertMessage: (...args: unknown[]) => mocks.insertMessage(...args),
  getMessages: vi.fn(() => []),
  getMessagesForRequestGroup: vi.fn(() => []),
  getMessagesForRequestGroupWithRunMeta: vi.fn(() => []),
  getMessagesForRun: (...args: unknown[]) => mocks.getMessagesForRun(...args),
  getPromptSourceStates: vi.fn(() => []),
  insertDiagnosticEvent: vi.fn(),
  insertMemoryItem: vi.fn(),
  markMessagesCompressed: vi.fn(),
  updateRunPromptSourceSnapshot: vi.fn(),
  upsertPromptSources: vi.fn(),
}))

vi.mock("../packages/core/src/memory/store.js", () => ({
  buildMemoryContext: (...args: unknown[]) => mocks.buildMemoryContext(...args),
}))

vi.mock("../packages/core/src/memory/knowbee-md.js", () => ({
  loadKnowbeeMd: vi.fn(() => ""),
  loadBundledPromptTemplate: vi.fn(() => ""),
  loadPromptSourceRegistry: vi.fn(() => []),
  loadPromptTemplate: vi.fn((input: { sourceId?: string; variables?: Record<string, unknown> }) => {
    if (input.sourceId === "runtime_identity_context") {
      return [
        "[Trusted Main Agent Identity]",
        `- Current main-agent self name: \`${String(input.variables?.mainAgentName ?? "")}\`.`,
      ].join("\n")
    }
    if (input.sourceId === "agent_runtime_prompt_context_labels_user") {
      return [
        "## Value",
        "runtime_header=[Runtime]",
        `today_line=Today: ${String(input.variables?.today ?? "")}`,
        "instruction_chain_header=Instructions",
      ].join("\n")
    }
    if (input.sourceId === "profile_context_user_header_user") {
      return "## Value\n[User Profile]"
    }
    return "# Test System Prompt\n\nYou are {{mainAgentName}}."
  }),
  loadSystemPromptSourceAssembly: vi.fn(() => null),
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
    getAll: (...args: unknown[]) => mocks.getAll(...args),
    isToolAvailableForSource: () => true,
    dispatch: (...args: unknown[]) => mocks.dispatch(...args),
  },
}))

const tempDirs: string[] = []

function useTempConfig(input: {
  profileName?: string
  profileDisplayName?: string
  mainAgentName?: string
} = {}): { config: KnowbeeConfig } & TestAgentRuntimeDependencies {
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0148-run-agent-self-name-"))
  tempDirs.push(rootDir)
  const profileName = input.profileName ?? "사용자"
  const profileDisplayName = input.profileDisplayName ?? profileName
  const mainAgentName = input.mainAgentName ?? "마당쇠"
  const runtimeFixture = createTestRuntimeConfigFixture({
    rootDir,
    configText: `{
    profile: { profileName: "${profileName}", displayName: "${profileDisplayName}", language: "ko" },
    orchestration: {
      knowbee: {
        agentName: "${mainAgentName}",
        displayName: "Legacy Main Display",
        nickname: "Legacy Main Nick"
      }
    }
  }`,
  })
  return {
    config: runtimeFixture.config,
    ...createTestAgentRuntimeDependencies(rootDir),
  }
}

afterEach(() => {
  mocks.getAll.mockReset()
  mocks.getAll.mockReturnValue([])
  mocks.dispatch.mockReset()
  mocks.getMessagesForRun.mockReset()
  mocks.getMessagesForRun.mockReturnValue([])
  mocks.buildMemoryContext.mockReset()
  mocks.buildMemoryContext.mockResolvedValue("")
  mocks.insertMessage.mockReset()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0148 runAgent LLM-owned identity response", () => {
  it("injects trusted identity context without replacing the model response by keyword", async () => {
    const runtime = useTempConfig()
    const { runAgent } = await import("../packages/core/src/agent/index.ts")
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "제 이름은 Knowbee입니다." } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: runtime.config,
      userMessage: "니 이름이 뭐니?",
      sessionId: "session-task0148",
      runId: "run-task0148",
      model: "gpt-test",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
      artifactStorage: runtime.artifactStorage,
      memoryJournal: runtime.memoryJournal,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat.mock.calls[0]?.[0].system).toContain("Current main-agent self name: `마당쇠`")
    expect(chunks).toEqual([
      { type: "text", delta: "제 이름은 Knowbee입니다.", textSource: "llm_generated" },
      { type: "done", totalTokens: 2 },
    ])
    expect(mocks.insertMessage.mock.calls.some(([message]) => {
      return (message as { role?: string }).role === "assistant"
    })).toBe(false)
  })

  it("keeps configured identity in the LLM context even when it equals the user profile name", async () => {
    const runtime = useTempConfig({
      profileName: "마당쇠",
      profileDisplayName: "마당쇠",
      mainAgentName: "마당쇠",
    })
    const { runAgent } = await import("../packages/core/src/agent/index.ts")
    const provider = {
      chat: vi.fn(async function* () {
        yield { type: "text_delta", delta: "제 이름은 Knowbee입니다." } as const
        yield {
          type: "message_stop",
          usage: { input_tokens: 1, output_tokens: 1 },
        } as const
      }),
    }

    const chunks = []
    for await (const chunk of runAgent({
      config: runtime.config,
      userMessage: "니 이름이 뭐니?",
      sessionId: "session-task0148-same-user-name",
      runId: "run-task0148-same-user-name",
      model: "gpt-test",
      provider: provider as never,
      source: "telegram",
      toolsEnabled: false,
      artifactStorage: runtime.artifactStorage,
      memoryJournal: runtime.memoryJournal,
    })) {
      chunks.push(chunk)
    }

    expect(provider.chat.mock.calls[0]?.[0].system).toContain("Current main-agent self name: `마당쇠`")
    expect(chunks).toEqual([
      { type: "text", delta: "제 이름은 Knowbee입니다.", textSource: "llm_generated" },
      { type: "done", totalTokens: 2 },
    ])
  })
})
