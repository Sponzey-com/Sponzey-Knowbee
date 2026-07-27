import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCodexOAuthFallbackPrompt,
  OpenAIProvider,
  shouldRetryCodexOAuthWithSimplePayload,
} from "../packages/core/src/ai/providers/openai.ts"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("buildCodexOAuthFallbackPrompt", () => {
  it("flattens recent structured messages into a plain prompt transcript", () => {
    const prompt = buildCodexOAuthFallbackPrompt([
      { role: "user", content: "첫 질문" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "도구를 써볼게요" },
          { type: "tool_use", id: "call_1", name: "web_search", input: { q: "동천동 날씨" } },
        ],
      },
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "call_1", content: "검색 실패" },
          { type: "text", text: "다시 확인해줘" },
        ],
      },
    ])

    expect(prompt).toContain("User: 첫 질문")
    expect(prompt).toContain("Assistant: 도구를 써볼게요")
    expect(prompt).toContain("[tool request] web_search")
    expect(prompt).toContain("[tool result] 검색 실패")
    expect(prompt).toContain("User: [tool result] 검색 실패")
  })
})

describe("shouldRetryCodexOAuthWithSimplePayload", () => {
  it("does not retry an auth failure by changing an unrelated payload", () => {
    expect(shouldRetryCodexOAuthWithSimplePayload({
      status: 403,
      detail: "<html><body>forbidden</body></html>",
      hasTools: true,
      requiredToolChoice: true,
      hasMaxOutputTokens: true,
      messageCount: 3,
      hasStructuredConversation: true,
    })).toBe(false)
  })

  it("does not retry for a simple single-message payload", () => {
    expect(shouldRetryCodexOAuthWithSimplePayload({
      status: 403,
      detail: "<html><body>forbidden</body></html>",
      hasTools: false,
      requiredToolChoice: false,
      hasMaxOutputTokens: false,
      messageCount: 1,
      hasStructuredConversation: false,
    })).toBe(false)
  })
})

describe("Codex OAuth required-tool fallback", () => {
  it("does not repeat a rejected required-tool contract", async () => {
    const dir = mkdtempSync(join(tmpdir(), "knowbee-codex-oauth-"))
    const authFilePath = join(dir, "auth.json")
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: "test-token" } }))
    const bodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
      return new Response("invalid rich payload", { status: 400 })
    })
    vi.stubGlobal("fetch", fetchMock)

    try {
      const provider = new OpenAIProvider(
        { apiKeys: [], currentKeyIndex: 0, cooldowns: new Map() },
        undefined,
        { authFilePath },
      )
      const consume = async (): Promise<void> => {
        for await (const _chunk of provider.chat({
          model: "gpt-5.4",
          system: "Use the available tool.",
          messages: [{ role: "user", content: "Get the current stock price." }],
          tools: [{
            name: "web_search",
            description: "Search the web.",
            input_schema: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          }],
          toolChoice: "required",
        })) {
          // Consume the stream.
        }
      }

      await expect(consume()).rejects.toMatchObject({
        kind: "knowbee.ai_provider_invocation_error.v1",
        reasonCode: "provider_contract_rejected",
      })
      expect(bodies).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
