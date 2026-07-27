import { describe, expect, it } from "vitest"

import { AiChatSolutionPlanProviderAdapter } from "../packages/core/src/ai/solution-plan-adapter.ts"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"
import { runLlmSolutionPlanProvider } from "../packages/core/src/contracts/index.ts"

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  constructor(private readonly output: unknown, private readonly textOnly = false) {}

  maxContextTokens(): number {
    return 16_000
  }

  async *chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    if (this.textOnly) {
      yield { type: "text_delta", delta: String(this.output) }
    } else {
      yield {
        type: "tool_use",
        id: "solution-plan-response",
        name: "submit_solution_plan",
        input: this.output,
      }
    }
    yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } }
  }
}

const step = {
  step_id: "inspect",
  owner_agent_name: "마당쇠",
  action_type: "use_tool",
  input_refs: ["request:1", "capability:tool:shell-read"],
  expected_output: "Repository state.",
  completion_criteria: "Command evidence exists.",
  status: "pending",
}

describe("task014 AI solution-plan adapter", () => {
  it("uses the file-backed instruction and workflow system block through AIProvider", async () => {
    const provider = new FakeProvider({ ownerAgentName: "마당쇠", steps: [step] })
    const adapter = new AiChatSolutionPlanProviderAdapter({
      provider,
      model: "fake-model",
      solutionPlanPromptSourceBlock: "# Workflow Policy\nPlan verifiable steps.",
      maxTokens: 512,
    })

    const result = await runLlmSolutionPlanProvider({
      provider: adapter,
      workId: "work:1",
      runId: "run:1",
      ownerAgentName: "마당쇠",
      requestDiagnosisReceiptId: "receipt:diagnosis:1",
      requestDiagnosisIssuedAt: 100,
      issuedAt: 101,
      goal: "Inspect repository.",
      constraints: [],
      capabilityRefs: ["tool:shell-read"],
      completionCriteria: ["Return command evidence."],
    })

    expect(result.status).toBe("valid")
    expect(provider.calls[0]?.system).toContain("Workflow Policy")
    expect(provider.calls[0]?.toolChoice).toBe("required")
    expect(provider.calls[0]?.tools?.map((tool) => tool.name)).toEqual([
      "submit_solution_plan",
    ])
    const payload = JSON.parse(String(provider.calls[0]?.messages[0]?.content)) as {
      kind: string
      instruction: string
      input: unknown
    }
    expect(payload.kind).toBe("solution_plan")
    expect(payload.instruction).toContain("LlmSolutionPlanPayload")
    expect(payload.instruction).toContain(
      "one ordered `use_tool` step for each required capability",
    )
    expect(payload.input).toMatchObject({
      workId: "work:1",
      capabilityRefs: ["capability:tool:shell-read"],
    })
  })

  it("returns an invalid object for malformed model text so the use case blocks it", async () => {
    const provider = new FakeProvider("not-json", true)
    const adapter = new AiChatSolutionPlanProviderAdapter({
      provider,
      model: "fake-model",
      solutionPlanPromptSourceBlock: "workflow",
    })
    const raw = await adapter.planSolution({
      workId: "work:1",
      runId: "run:1",
      ownerAgentName: "마당쇠",
      requestDiagnosisReceiptId: "receipt:diagnosis:1",
      goal: "Inspect.",
      constraints: [],
      capabilityRefs: [],
      completionCriteria: ["Evidence exists."],
    })
    expect(raw).toMatchObject({
      solution_plan_adapter_error: "response_tool_missing",
    })
    expect(provider.calls).toHaveLength(1)
  })

})
