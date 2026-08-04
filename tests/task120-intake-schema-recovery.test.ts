import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createInstructionRuntimeContext } from "../packages/core/src/instructions/merge.js"
import { runIntakeBridgePass } from "../packages/core/src/runs/intake-bridge-pass.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"
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
const intakeRuntime = createTestAgentRuntimeDependencies("/tmp/knowbee-task120-intake")

afterEach(() => {
  aiMocks.getProvider.mockReset()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task120 intake schema failure", () => {
  it("allows one schema repair and then rejects the repeated invalid contract class", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task120-schema-repair-"))
    tempDirs.push(rootDir)
    const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
    const provider = {
      chat: vi.fn(async function* () {
        yield {
          type: "text_delta",
          delta: "not-json",
        } as const
      }),
    }
    aiMocks.getProvider.mockReturnValue(provider)
    const { analyzeTaskIntake } = await import("../packages/core/src/agent/intake.ts")

    const result = await analyzeTaskIntake({
      instructionRuntime: createInstructionRuntimeContext(runtimeFixture.paths.stateDir),
      config: runtimeFixture.config,
      userMessage: "SK하이닉스의 현재 주가를 알려줘.",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })

    expect(provider.chat).toHaveBeenCalledTimes(2)
    expect(provider.chat.mock.calls[0]?.[0]).toMatchObject({
      toolChoice: "required",
      tools: [{ name: "submit_task_intake" }],
    })
    expect(provider.chat.mock.calls[1]?.[0]).toMatchObject({
      toolChoice: "required",
      tools: [{ name: "submit_task_intake" }],
      messages: [
        expect.any(Object),
        expect.objectContaining({
          content: expect.stringContaining("task-intake contract validation"),
        }),
      ],
    })
    expect(result).toBeNull()
  })

  it("blocks instead of repeating an invalid intake without canonical admission", async () => {
    const dependencies = {
      appendRunEvent: vi.fn(),
      updateRunSummary: vi.fn(),
      incrementDelegationTurnCount: vi.fn(),
      emitScheduleCreated: vi.fn(),
      emitScheduleCancelled: vi.fn(),
      scheduleDelayedRun: vi.fn(),
      startDelegatedRun: vi.fn(),
      normalizeTaskProfile: vi.fn((profile) => profile ?? "general_chat"),
      logInfo: vi.fn(),
      recordCanonicalIntakeDiagnosis: vi.fn(),
      authorizeCanonicalIntakePlan: vi.fn(),
      recordCanonicalExecutionStart: vi.fn(),
      releaseCanonicalSimplePath: vi.fn(),
    }

    await expect(
      runIntakeBridgePass(
        {
          artifactStorage: intakeRuntime.artifactStorage,
          message: "SK하이닉스의 현재 주가를 알려줘.",
          originalRequest: "SK하이닉스의 현재 주가를 알려줘.",
          sessionId: "session-task120",
          requestGroupId: "run-task120",
          config: DEFAULT_CONFIG,
          workDir: process.cwd(),
          source: "webui",
          runId: "run-task120",
          onChunk: undefined,
          reuseConversationContext: false,
        },
        dependencies,
        { analyzeTaskIntake: vi.fn().mockResolvedValue(null) } as never,
      ),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "intake",
      reasonCode: "intake_contract_unavailable",
      retryable: false,
    })
    expect(dependencies.recordCanonicalIntakeDiagnosis).not.toHaveBeenCalled()
    expect(dependencies.authorizeCanonicalIntakePlan).not.toHaveBeenCalled()
    expect(dependencies.recordCanonicalExecutionStart).not.toHaveBeenCalled()
  })

  it("preserves an already typed provider contract failure from intake", async () => {
    const dependencies = {
      appendRunEvent: vi.fn(),
      updateRunSummary: vi.fn(),
      incrementDelegationTurnCount: vi.fn(),
      emitScheduleCreated: vi.fn(),
      emitScheduleCancelled: vi.fn(),
      scheduleDelayedRun: vi.fn(),
      startDelegatedRun: vi.fn(),
      normalizeTaskProfile: vi.fn((profile) => profile ?? "general_chat"),
      logInfo: vi.fn(),
      recordCanonicalIntakeDiagnosis: vi.fn(),
      authorizeCanonicalIntakePlan: vi.fn(),
      recordCanonicalExecutionStart: vi.fn(),
      releaseCanonicalSimplePath: vi.fn(),
    }
    const providerFailure = {
      status: "failure",
      reasonCode: "provider_contract_rejected",
      retryable: false,
    } as const

    await expect(
      runIntakeBridgePass(
        {
          artifactStorage: intakeRuntime.artifactStorage,
          message: "현재 주가를 알려줘.",
          originalRequest: "현재 주가를 알려줘.",
          sessionId: "session-provider-contract",
          requestGroupId: "run-provider-contract",
          config: DEFAULT_CONFIG,
          workDir: process.cwd(),
          source: "webui",
          runId: "run-provider-contract",
          onChunk: undefined,
          reuseConversationContext: false,
        },
        dependencies,
        { analyzeTaskIntake: vi.fn().mockResolvedValue(providerFailure) } as never,
      ),
    ).rejects.toMatchObject({
      kind: "knowbee.canonical_execution_failure.v1",
      phase: "intake",
      reasonCode: "provider_contract_rejected",
      retryable: false,
    })
  })
})
