import { describe, expect, it } from "vitest"

import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import {
  AiChatWebEvidencePipelineAdapter,
  WEB_EVIDENCE_AI_OPERATIONS,
} from "../packages/core/src/ai/web-evidence-pipeline-adapter.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  constructor(private readonly invalidJson = false) {}

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    const payload = JSON.parse(String(params.messages[0]?.content)) as { kind: string }
    yield {
      type: "text_delta",
      delta: this.invalidJson ? "private malformed model output" : JSON.stringify({
        operation: payload.kind,
      }),
    }
  }
}

describe("file-backed web evidence AI adapter", () => {
  it("registers one English system responsibility and serialization instruction per operation", () => {
    const sources = loadPromptSourceRegistry(process.cwd())
    for (const operation of WEB_EVIDENCE_AI_OPERATIONS) {
      const system = sources.filter((source) => source.sourceId === operation)
      const instruction = sources.filter(
        (source) => source.sourceId === `${operation}_json_instruction_user`,
      )
      expect(system).toHaveLength(1)
      expect(system[0]?.locale).toBe("en")
      expect(system[0]?.content).toMatch(/^# /u)
      expect(instruction).toHaveLength(1)
      expect(instruction[0]?.locale).toBe("en")
    }
  })

  it("uses the matching prompt and instruction for all five port methods", async () => {
    const provider = new FakeProvider()
    const promptSourceBlocks = Object.fromEntries(
      WEB_EVIDENCE_AI_OPERATIONS.map((operation) => [
        operation,
        `SYSTEM_MARKER_${operation}`,
      ]),
    ) as Record<(typeof WEB_EVIDENCE_AI_OPERATIONS)[number], string>
    const adapter = new AiChatWebEvidencePipelineAdapter({
      provider,
      model: "fake-model",
      workDir: process.cwd(),
      promptSourceBlocks,
      observabilityContext: { runId: "run-web-evidence" },
    })

    const outputs = await Promise.all([
      adapter.selectSources({} as never),
      adapter.selectChunks({} as never),
      adapter.compressEvidence({} as never),
      adapter.reviewEvidence({} as never),
      adapter.verifyEvidence({} as never),
    ])

    expect(outputs.map((output) => (output as { operation: string }).operation))
      .toEqual([...WEB_EVIDENCE_AI_OPERATIONS])
    expect(provider.calls).toHaveLength(5)
    provider.calls.forEach((call, index) => {
      const operation = WEB_EVIDENCE_AI_OPERATIONS[index]!
      const payload = JSON.parse(String(call.messages[0]?.content))
      expect(call.system).toBe(`SYSTEM_MARKER_${operation}`)
      expect(payload.kind).toBe(operation)
      expect(payload.instruction).toBeTruthy()
      expect(call.observability).toMatchObject({
        runId: "run-web-evidence",
        operationCode: operation,
      })
    })
  })

  it("returns a closed error without exposing malformed model output", async () => {
    const adapter = new AiChatWebEvidencePipelineAdapter({
      provider: new FakeProvider(true),
      model: "fake-model",
      workDir: process.cwd(),
      promptSourceBlocks: Object.fromEntries(
        WEB_EVIDENCE_AI_OPERATIONS.map((operation) => [operation, operation]),
      ) as Record<(typeof WEB_EVIDENCE_AI_OPERATIONS)[number], string>,
    })

    const result = await adapter.selectSources({} as never)

    expect(result).toEqual({
      web_evidence_adapter_error: "invalid_json_object",
      operation: "web_source_selection",
    })
    expect(JSON.stringify(result)).not.toContain("private malformed model output")
  })
})
