import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AIProviderInvocationError,
  providerFailureReasonForHttpStatus,
} from "../packages/core/src/ai/provider-failure.ts"
import { collectBoundedChatAttempt } from "../packages/core/src/ai/bounded-chat-attempt.ts"
import { createInstructionRuntimeContext } from "../packages/core/src/instructions/merge.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

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

describe("intake provider failure subtype", () => {
  it("maps schema rejection and service status without response body inspection", () => {
    expect(providerFailureReasonForHttpStatus(400)).toBe("provider_contract_rejected")
    expect(providerFailureReasonForHttpStatus(422)).toBe("provider_contract_rejected")
    expect(providerFailureReasonForHttpStatus(429)).toBe("provider_unavailable")
    expect(providerFailureReasonForHttpStatus(503)).toBe("provider_unavailable")
  })

  it.each([
    ["provider_contract_rejected", false],
    ["transport_failed", true],
    ["provider_unavailable", true],
  ] as const)("preserves %s through bounded attempt and intake", async (reasonCode, retryable) => {
    const stream = async function* () {
      throw new AIProviderInvocationError(reasonCode)
    }
    await expect(collectBoundedChatAttempt({
      stream,
      deadlineMs: 1_000,
      maxTextBytes: 1_000,
      maxToolInputBytes: 1_000,
    })).resolves.toEqual({
      status: "provider_failed",
      reasonCode,
    })

    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-provider-failure-"))
    tempDirs.push(rootDir)
    const runtime = createTestRuntimeConfigFixture({ rootDir })
    aiMocks.getProvider.mockReturnValue({
      id: "mock-provider",
      maxContextTokens: vi.fn(() => 128_000),
      chat: stream,
    })
    const { analyzeTaskIntakeOutcome } = await import("../packages/core/src/agent/intake.ts")

    await expect(analyzeTaskIntakeOutcome({
      instructionRuntime: createInstructionRuntimeContext(runtime.paths.stateDir),
      config: runtime.config,
      userMessage: "현재 주가를 알려줘.",
      model: "fake-model",
      source: "webui",
      workDir: process.cwd(),
    })).resolves.toEqual({
      status: "failure",
      reasonCode,
      retryable,
    })
  })
})
