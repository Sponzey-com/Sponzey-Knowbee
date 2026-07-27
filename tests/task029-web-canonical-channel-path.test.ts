import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { AgentChunk } from "../packages/core/src/agent/index.ts"
import type { ChannelSource } from "../packages/core/src/channels/contracts.ts"
import {
  createExecutionChunkStream,
  type ExecutionChunkStreamParams,
} from "../packages/core/src/runs/execution-runtime.ts"
import type { AdmittedCapabilityExecutionScope } from "../packages/core/src/runs/run-scoped-tool-admission.ts"

const admittedScope: AdmittedCapabilityExecutionScope = Object.freeze({
  schemaVersion: 1,
  runId: "run:web",
  ownerAgentId: "main",
  receiptId: "receipt:web",
  capabilitySnapshotFingerprint: `sha256:${"a".repeat(64)}`,
  selectedCapabilityId: "skill:web-research",
  toolNames: Object.freeze(["web_search", "web_fetch"]),
})

function createParams(source: ChannelSource): ExecutionChunkStreamParams {
  return {
    artifactStorage: {} as ExecutionChunkStreamParams["artifactStorage"],
    memoryJournal: {} as ExecutionChunkStreamParams["memoryJournal"],
    config: {} as ExecutionChunkStreamParams["config"],
    userMessage: "현재 정보를 조사해 주세요.",
    requiredToolNames: [],
    admittedCapabilityExecutionScope: admittedScope,
    memorySearchQuery: "현재 정보",
    sessionId: `session:${source}`,
    runId: "run:web",
    workDir: "/workspace",
    source,
    signal: new AbortController().signal,
    isRootRequest: true,
    requestGroupId: "request:web",
    contextMode: "full",
  }
}

async function drain(stream: AsyncGenerator<AgentChunk>): Promise<void> {
  for await (const _chunk of stream) {
    // The captured runAgent input is the behavior under test.
  }
}

describe("task029 canonical web channel path", () => {
  it.each(["telegram", "webui", "cli"] as const)(
    "forwards the same admitted web scope from the %s execution stream",
    async (source) => {
      const inputs: Array<Record<string, unknown>> = []
      async function* runAgent(
        input: Record<string, unknown>,
      ): AsyncGenerator<AgentChunk> {
        inputs.push(input)
        yield { type: "done" }
      }

      await drain(createExecutionChunkStream(createParams(source), {
        runAgent: runAgent as never,
      }))

      expect(inputs).toHaveLength(1)
      expect(inputs[0]).toMatchObject({
        source,
        runId: "run:web",
        requiredToolNames: [],
        admittedCapabilityExecutionScope: admittedScope,
      })
    },
  )

  it("keeps live scenario execution outside production channel and run paths", () => {
    const productionPaths = [
      "packages/core/src/channels/telegram/bot.ts",
      "packages/core/src/channels/slack/bot.ts",
      "packages/core/src/api/routes/runs.ts",
      "packages/cli/src/commands/run.ts",
      "packages/core/src/runs/start.ts",
      "packages/core/src/runs/execution-runtime.ts",
      "packages/core/src/agent/index.ts",
    ]

    for (const path of productionPaths) {
      expect(readFileSync(path, "utf8"), path).not.toContain(
        "runWebRetrievalLiveScenario",
      )
    }
  })

  it("routes supported interactive channels through the canonical ingress", () => {
    const ingressOwners = [
      "packages/core/src/channels/telegram/bot.ts",
      "packages/core/src/channels/slack/bot.ts",
      "packages/core/src/api/routes/runs.ts",
      "packages/cli/src/commands/run.ts",
    ]

    for (const path of ingressOwners) {
      const source = readFileSync(path, "utf8")
      expect(source, path).toMatch(/\b(?:submitUserRequest|startIngressRun)\s*\(/u)
      expect(source, path).not.toMatch(/\bstartRootRun\s*\(/u)
    }
  })
})
