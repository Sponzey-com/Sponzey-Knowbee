import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import {
  createFileBackedDiagnosisProvider,
  renderDiagnosisPromptSourceBlock,
  selectDiagnosisPromptSources,
} from "../packages/core/src/orchestration/prompt-policy-adapter.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

const tempDirs: string[] = []

class FakeAiProvider implements AIProvider {
  readonly id = "fake-ai"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  maxContextTokens(_model: string): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    yield {
      type: "text_delta",
      delta: JSON.stringify({
        diagnosis_summary: "The request should be planned.",
        intent: "implementation_request",
        goal: "Implement the requested behavior.",
        constraints: [],
        missing_information: [],
        risk: "low",
        confidence: "high",
        recommended_action: "plan",
        reason: "Planning is the safest next step.",
      }),
    }
    yield { type: "message_stop", usage: { input_tokens: 10, output_tokens: 20 } }
  }
}

function createPromptRoot(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "knowbee-diagnosis-prompts-"))
  tempDirs.push(root)
  const promptsDir = join(root, "prompts")
  mkdirSync(promptsDir)
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(promptsDir, filename), content, "utf-8")
  }
  return root
}

function createCompletePromptRoot(): string {
  return createPromptRoot({
    "work_record.md": "# Work Record Policy\n\nWORK_RECORD_MARKER\n",
    "request_diagnosis.md": "# Request Diagnosis Prompt\n\nREQUEST_DIAGNOSIS_MARKER\n",
    "result_diagnosis.md": "# Result Diagnosis Prompt\n\nRESULT_DIAGNOSIS_MARKER\n",
    "diagnosis_schema_repair.md": "# Diagnosis Schema Repair Prompt\n\nSCHEMA_REPAIR_MARKER\n",
  })
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0016 file-backed diagnosis provider factory", () => {
  it("selects only diagnosis prompt sources in deterministic order", () => {
    const root = createCompletePromptRoot()
    const sources = loadPromptSourceRegistry(root)

    const selected = selectDiagnosisPromptSources({ sources, locale: "en" })

    expect(selected.map((source) => source.sourceId)).toEqual([
      "work_record",
      "request_diagnosis",
      "result_diagnosis",
      "diagnosis_schema_repair",
    ])
  })

  it("creates an AIProvider-backed diagnosis adapter with file-backed system prompt", async () => {
    const root = createCompletePromptRoot()
    const provider = new FakeAiProvider()
    const adapter = createFileBackedDiagnosisProvider({
      provider,
      model: "fake-model",
      workDir: root,
      maxTokens: 512,
    })

    const result = await adapter.diagnoseRequest({
      ownerAgentName: "마당쇠",
      userRequestSummary: "사용자가 구현을 요청했습니다.",
      context: [],
      constraints: [],
      workId: "work-1",
      stepId: "request-diagnosis",
    })

    expect(result).toEqual(expect.objectContaining({ recommended_action: "plan" }))
    expect(provider.calls).toHaveLength(1)
    expect(provider.calls[0]?.model).toBe("fake-model")
    expect(provider.calls[0]?.maxTokens).toBe(512)
    expect(provider.calls[0]?.system).toContain("WORK_RECORD_MARKER")
    expect(provider.calls[0]?.system).toContain("REQUEST_DIAGNOSIS_MARKER")
    expect(provider.calls[0]?.system).toContain("RESULT_DIAGNOSIS_MARKER")
    expect(provider.calls[0]?.system).toContain("SCHEMA_REPAIR_MARKER")
  })

  it("rejects missing diagnosis prompt sources instead of creating a partial adapter", () => {
    const root = createPromptRoot({
      "work_record.md": "# Work Record Policy\n\nWORK_RECORD_MARKER\n",
      "request_diagnosis.md": "# Request Diagnosis Prompt\n\nREQUEST_DIAGNOSIS_MARKER\n",
      "result_diagnosis.md": "# Result Diagnosis Prompt\n\nRESULT_DIAGNOSIS_MARKER\n",
    })

    expect(() => createFileBackedDiagnosisProvider({
      provider: new FakeAiProvider(),
      model: "fake-model",
      workDir: root,
    })).toThrow(/diagnosis prompt sources missing: diagnosis_schema_repair/iu)
  })

  it("rejects missing diagnosis support contract sources with a clear source id", () => {
    const root = createPromptRoot({
      "request_diagnosis.md": "# Request Diagnosis Prompt\n\nREQUEST_DIAGNOSIS_MARKER\n",
      "result_diagnosis.md": "# Result Diagnosis Prompt\n\nRESULT_DIAGNOSIS_MARKER\n",
      "diagnosis_schema_repair.md": "# Diagnosis Schema Repair Prompt\n\nSCHEMA_REPAIR_MARKER\n",
    })

    expect(() => createFileBackedDiagnosisProvider({
      provider: new FakeAiProvider(),
      model: "fake-model",
      workDir: root,
    })).toThrow(/diagnosis prompt sources missing: work_record/iu)
  })

  it("renders traceable prompt source metadata", () => {
    const root = createCompletePromptRoot()
    const sources = selectDiagnosisPromptSources({ sources: loadPromptSourceRegistry(root), locale: "en" })
    const block = renderDiagnosisPromptSourceBlock({ sources, locale: "en" })

    expect(block).toContain("[Diagnosis Prompt Sources]")
    expect(block).toContain("sourceId: work_record")
    expect(block).toContain("sourceId: request_diagnosis")
    expect(block).toContain("usageScope: runtime")
    expect(block).toContain("usageScope: internal")
    expect(block).toContain("checksum:")
  })
})
