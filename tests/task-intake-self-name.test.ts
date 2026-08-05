import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { analyzeTaskIntake } from "../packages/core/src/agent/intake.ts"
import { createInstructionRuntimeContext } from "../packages/core/src/instructions/merge.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.js"

const aiMocks = vi.hoisted(() => ({
  getProvider: vi.fn(),
}))

vi.mock("../packages/core/src/ai/index.js", () => ({
  detectAvailableProvider: vi.fn(() => "mock-provider"),
  getDefaultModel: vi.fn(() => "fake-model"),
  getProvider: aiMocks.getProvider,
}))

const tempDirs: string[] = []

afterEach(() => {
  aiMocks.getProvider.mockReset()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task intake self-name handling", () => {
  it("routes Korean main-agent self-name requests through the intake model with identity context", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-intake-self-name-"))
    tempDirs.push(rootDir)
    const runtimeFixture = createTestRuntimeConfigFixture({
      rootDir,
      configText: `
      {
        profile: { language: "ko" },
        orchestration: {
          knowbee: {
            displayName: "Knowbee",
            nickname: "Knowbee"
          }
        }
      }
    `,
    })
    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "intake-self-name",
          name: "submit_task_intake",
          input: {
            intent: {
              category: "direct_answer",
              summary: "메인 에이전트 이름 질문",
              confidence: 1,
            },
            user_message: {
              mode: "direct_answer",
              text: "제 이름은 노비입니다.",
            },
            identity_claim: { subject: "main_agent", claimed_name: "노비" },
            action_items: [{
              id: "reply-main-agent-self-name",
              type: "reply",
              title: "메인 에이전트 이름 응답",
              priority: "normal",
              reason: "사용자가 메인 에이전트의 이름을 물었습니다.",
              payload: { content: "제 이름은 노비입니다." },
            }],
            scheduling: {
              detected: false,
              kind: "none",
              status: "not_applicable",
              schedule_text: "",
            },
            execution: {
              requires_run: false,
              requires_delegation: false,
              suggested_target: "agent:knowbee",
              max_delegation_turns: 3,
              needs_tools: false,
              needs_web: false,
              execution_semantics: {
                approvalRequired: false,
                privilegedOperation: "none",
                approvalTool: null,
                artifactDelivery: "none",
                requiresUserVisibleProgress: false,
                taskProfile: "general_chat",
              },
            },
            notes: ["llm-main-agent-self-name"],
          },
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtimeFixture.paths.stateDir),
      config: runtimeFixture.config,
      userMessage: "니 이름을 말해봐",
      model: "fake-model",
      source: "telegram",
      workDir: process.cwd(),
    })

    expect(aiMocks.getProvider).toHaveBeenCalledWith("mock-provider", runtimeFixture.config)
    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("[Trusted Main Agent Identity]")
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("Current main-agent self name: `노비`")
    expect(result?.intent.category).toBe("direct_answer")
    expect(result?.user_message.mode).toBe("direct_answer")
    expect(result?.user_message.text).toBe("제 이름은 노비입니다.")
    expect(result?.notes).toContain("llm-intake-result")
    expect(result?.notes).toContain("llm-main-agent-self-name")
  })

  it("rejects a mismatched main-agent self-name without an inline repair call", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-intake-self-name-custom-"))
    tempDirs.push(rootDir)
    const runtimeFixture = createTestRuntimeConfigFixture({
      rootDir,
      configText: `
      {
        profile: { profileName: "사용자", displayName: "사용자", language: "ko" },
        orchestration: {
          knowbee: {
            agentName: "마당쇠",
            displayName: "Legacy Main Display",
            nickname: "Legacy Main Nick"
          }
        }
      }
    `,
    })
    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "intake-mismatched-self-name",
          name: "submit_task_intake",
          input: {
            intent: {
              category: "direct_answer",
              summary: "메인 에이전트 이름 질문",
              confidence: 1,
            },
            user_message: {
              mode: "direct_answer",
              text: "제 이름은 Knowbee예요.",
            },
            identity_claim: { subject: "main_agent", claimed_name: "Knowbee" },
            action_items: [{
              id: "reply-main-agent-self-name",
              type: "reply",
              title: "메인 에이전트 이름 응답",
              priority: "normal",
              reason: "사용자가 메인 에이전트의 이름을 물었습니다.",
              payload: { content: "제 이름은 Knowbee예요." },
            }],
            scheduling: {
              detected: false,
              kind: "none",
              status: "not_applicable",
              schedule_text: "",
            },
            execution: {
              requires_run: false,
              requires_delegation: false,
              suggested_target: "agent:knowbee",
              max_delegation_turns: 3,
              needs_tools: false,
              needs_web: false,
              execution_semantics: {
                approvalRequired: false,
                privilegedOperation: "none",
                approvalTool: null,
                artifactDelivery: "none",
                requiresUserVisibleProgress: false,
                taskProfile: "general_chat",
              },
            },
            notes: ["llm-main-agent-self-name"],
          },
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtimeFixture.paths.stateDir),
      config: runtimeFixture.config,
      userMessage: "니 이름이 뭐니?",
      model: "fake-model",
      source: "telegram",
      workDir: process.cwd(),
    })

    expect(provider.chat.mock.calls[0]?.[0].system).toContain("Current main-agent self name: `마당쇠`")
    expect(result).toBeNull()
    expect(provider.chat).toHaveBeenCalledTimes(1)
  })

  it("rejects an LLM intake answer that substitutes agent_name for the user's name", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-intake-user-name-boundary-"))
    tempDirs.push(rootDir)
    const runtimeFixture = createTestRuntimeConfigFixture({
      rootDir,
      configText: `
      {
        profile: { profileName: "사용자", displayName: "마당쇠", language: "ko" },
        orchestration: { knowbee: { agentName: "노비" } }
      }
    `,
    })
    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "tool_use",
          id: "intake-mismatched-user-name",
          name: "submit_task_intake",
          input: {
            intent: { category: "direct_answer", summary: "사용자 이름 질문", confidence: 1 },
            user_message: { mode: "direct_answer", text: "사용자 이름은 노비입니다." },
            identity_claim: { subject: "user", claimed_name: "노비" },
            action_items: [{
              id: "reply-user-name",
              type: "reply",
              title: "사용자 이름 응답",
              priority: "normal",
              reason: "사용자가 자기 이름을 물었습니다.",
              payload: { content: "사용자 이름은 노비입니다." },
            }],
            scheduling: { detected: false, kind: "none", status: "not_applicable", schedule_text: "" },
            execution: {
              requires_run: false,
              requires_delegation: false,
              suggested_target: "agent:knowbee",
              max_delegation_turns: 0,
              needs_tools: false,
              needs_web: false,
              execution_semantics: {
                approvalRequired: false,
                privilegedOperation: "none",
                approvalTool: null,
                artifactDelivery: "none",
                requiresUserVisibleProgress: false,
                taskProfile: "general_chat",
              },
            },
            notes: ["llm-user-name"],
          },
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)
    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtimeFixture.paths.stateDir),
      config: runtimeFixture.config,
      userMessage: "내 이름이 뭐야?",
      model: "fake-model",
      source: "telegram",
      workDir: process.cwd(),
    })

    expect(provider.chat).toHaveBeenCalledTimes(1)
    expect(provider.chat.mock.calls[0]?.[0].system).toContain("- userName: 마당쇠")
    expect(result).toBeNull()
  })
})
