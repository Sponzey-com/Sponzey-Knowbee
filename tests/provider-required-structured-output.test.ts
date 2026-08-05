import { afterEach, describe, expect, it, vi } from "vitest"

import { toAnthropicToolChoice } from "../packages/core/src/ai/providers/anthropic.ts"
import { GeminiProvider } from "../packages/core/src/ai/providers/gemini.ts"
import type {
  AIChunk,
  AuthProfile,
  ChatParams,
  ToolDefinition,
} from "../packages/core/src/ai/types.ts"

const responseTool: ToolDefinition = {
  name: "submit_response",
  description: "Return one typed response.",
  input_schema: {
    type: "object",
    properties: { answer: { type: "string" } },
    required: ["answer"],
  },
}

function profile(): AuthProfile {
  return {
    apiKeys: ["test-key"],
    currentKeyIndex: 0,
    cooldowns: new Map(),
  }
}

function params(toolChoice: ChatParams["toolChoice"]): ChatParams {
  return {
    model: "test-model",
    messages: [{ role: "user", content: "Answer with the response tool." }],
    tools: [responseTool],
    toolChoice,
  }
}

async function consume(stream: AsyncGenerator<AIChunk>): Promise<void> {
  for await (const _chunk of stream) {
    // Consume the provider stream so the request contract is exercised.
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("provider required structured output", () => {
  it("forces Anthropic tool use when toolChoice is required", () => {
    expect(toAnthropicToolChoice("required", true)).toEqual({ type: "any" })
    expect(toAnthropicToolChoice("required", false)).toBeUndefined()
    expect(toAnthropicToolChoice("auto", true)).toBeUndefined()
  })

  it.each([
    ["required", "ANY"],
    ["auto", "AUTO"],
  ] as const)("maps Gemini %s tool choice to %s mode", async (toolChoice, mode) => {
    const requestBodies: Array<Record<string, unknown>> = []
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      return new Response(JSON.stringify({ candidates: [], usageMetadata: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    }))
    const provider = new GeminiProvider(profile(), "https://gemini.test")

    await consume(provider.chat(params(toolChoice)))

    expect(requestBodies).toHaveLength(1)
    expect(requestBodies[0]).toMatchObject({
      toolConfig: {
        functionCallingConfig: { mode },
      },
      tools: [{
        functionDeclarations: [{ name: "submit_response" }],
      }],
    })
  })
})
