import { describe, expect, it } from "vitest"

import { AiChatDiagnosisProviderAdapter } from "../packages/core/src/ai/diagnosis-adapter.ts"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"

const requestDiagnosis = {
  diagnosis_summary: "Plan the requested work.",
  intent: "implementation",
  goal: "Complete the requested change.",
  constraints: [],
  missing_information: [],
  risk: "low",
  confidence: "high",
  recommended_action: "plan",
  reason: "Execution requires a plan.",
}

const resultDiagnosis = {
  diagnosis_summary: "Evidence satisfies the goal.",
  sufficiency: "sufficient",
  missing_information: [],
  conflicts: [],
  risk: "none",
  risks: [],
  confidence: "high",
  recommended_action: "final_report",
  reason: "The result is verified.",
}

class Provider implements AIProvider {
  readonly id = "typed-diagnosis"
  readonly supportedModels = ["test"]
  readonly calls: ChatParams[] = []

  constructor(private readonly chunks: AIChunk[]) {}

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    yield* this.chunks
  }
}

function adapter(provider: Provider) {
  return new AiChatDiagnosisProviderAdapter({
    provider,
    model: "test",
    diagnosisPromptSourceBlock: "Diagnose with the required response tool.",
  })
}

describe("diagnosis typed response tools", () => {
  it.each([
    [
      "request",
      "submit_request_diagnosis",
      requestDiagnosis,
    ],
    [
      "result",
      "submit_result_diagnosis",
      resultDiagnosis,
    ],
  ] as const)("accepts one required %s diagnosis tool input", async (
    kind,
    toolName,
    value,
  ) => {
    const provider = new Provider([
      { type: "tool_use", id: "diagnosis", name: toolName, input: value },
      {
        type: "message_stop",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ])
    const result =
      kind === "request"
        ? await adapter(provider).diagnoseRequest({
            ownerAgentName: "Knowbee",
            userRequestSummary: "Implement the change.",
            context: [],
            constraints: [],
            stepId: "diagnose",
          })
        : await adapter(provider).diagnoseResult({
            ownerAgentName: "Knowbee",
            resultSummary: "Done.",
            expectedOutput: "Verified result.",
            evidence: ["test:pass"],
            risks: [],
            stepId: "review",
          })

    expect(result).toEqual(value)
    expect(provider.calls[0]?.toolChoice).toBe("required")
    expect(provider.calls[0]?.tools?.map((tool) => tool.name)).toEqual([
      toolName,
    ])
  })

  it("rejects text-only output without retaining a raw preview", async () => {
    const provider = new Provider([
      { type: "text_delta", delta: "secret plain JSON" },
      {
        type: "message_stop",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ])
    const result = await adapter(provider).diagnoseRequest({
      ownerAgentName: "Knowbee",
      userRequestSummary: "Implement the change.",
      context: [],
      constraints: [],
      stepId: "diagnose",
    })
    expect(result).toEqual({
      diagnosis_adapter_error: "response_tool_missing",
    })
    expect(JSON.stringify(result)).not.toContain("secret plain JSON")
    expect(provider.calls).toHaveLength(1)
  })
})
