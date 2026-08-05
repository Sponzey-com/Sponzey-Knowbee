import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { AiChatDiagnosisProviderAdapter } from "../packages/core/src/ai/diagnosis-adapter.ts"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import { loadPromptSourceRegistry } from "../packages/core/src/memory/knowbee-md.ts"

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
      type: "tool_use",
      id: "diagnosis-response",
      name: "submit_request_diagnosis",
      input: {
        diagnosis_summary: "The request should be planned.",
        intent: "implementation_request",
        goal: "Implement the requested behavior.",
        constraints: [],
        missing_information: [],
        risk: "low",
        confidence: "high",
        recommended_action: "plan",
        reason: "Planning is the safest next step.",
      },
    }
    yield { type: "message_stop", usage: { input_tokens: 10, output_tokens: 20 } }
  }
}

describe("task0949 diagnosis JSON instruction prompt source", () => {
  it("registers the diagnosis JSON instruction as a file-backed internal prompt source", () => {
    const source = loadPromptSourceRegistry(process.cwd())
      .find((item) => item.sourceId === "diagnosis_json_instruction_user" && item.locale === "en")

    expect(source).toMatchObject({
      sourceId: "diagnosis_json_instruction_user",
      usageScope: "internal",
      enabled: true,
    })
    expect(source?.path.endsWith("prompts/diagnosis_json_instruction_user.md")).toBe(true)
    expect(source?.content).toContain("## Value")
    expect(source?.content).toContain("Call exactly one diagnosis response tool")
  })

  it("renders only the Value section into diagnosis adapter payloads", async () => {
    const provider = new FakeAiProvider()
    const adapter = new AiChatDiagnosisProviderAdapter({
      provider,
      model: "fake-model",
      diagnosisPromptSourceBlock: "System diagnosis policy.",
      workDir: process.cwd(),
      maxTokens: 512,
    })

    await adapter.diagnoseRequest({
      ownerAgentName: "마당쇠",
      userRequestSummary: "사용자가 기능 구현을 요청했습니다.",
      context: [],
      constraints: [],
      workId: "work-1",
      stepId: "request-diagnosis",
    })

    const payload = JSON.parse(String(provider.calls[0]?.messages[0]?.content))
    expect(payload).toMatchObject({
      kind: "request_diagnosis",
      instruction: expect.stringContaining(
        "Call exactly one diagnosis response tool",
      ),
    })
    expect(payload.instruction).not.toContain("# Diagnosis JSON Instruction")
    expect(payload.instruction).not.toContain("## Value")
  })

  it("does not keep the diagnosis JSON instruction body hardcoded in the adapter TypeScript", () => {
    const source = readFileSync("packages/core/src/ai/diagnosis-adapter.ts", "utf-8")
    const factorySource = readFileSync("packages/core/src/orchestration/prompt-policy-adapter.ts", "utf-8")

    expect(source).toContain("diagnosis_json_instruction_user")
    expect(source).toContain("../memory/prompt-fragments.js")
    expect(factorySource).toContain("workDir: input.workDir")
    expect(source).not.toContain("Call exactly one diagnosis response tool required by the harness.")
  })
})
