import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  buildCodexOAuthFallbackPrompt,
  OpenAIProvider,
  shouldRetryCodexOAuthWithSimplePayload,
} from "../packages/core/src/ai/providers/openai.ts"
import { telegramSendFileTool } from "../packages/core/src/tools/builtin/telegram-send.ts"
import {
  yeonjangCameraCaptureTool,
  yeonjangCameraPermissionStatusTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"

type JsonSchema = Record<string, unknown>

function assertStrictSchema(schema: JsonSchema, path = "parameters"): void {
  for (const keyword of ["anyOf", "oneOf", "allOf"] as const) {
    const branches = schema[keyword]
    if (!Array.isArray(branches)) continue
    branches.forEach((branch, index) => {
      expect(branch, `${path}.${keyword}[${index}]`).toBeTypeOf("object")
      assertStrictSchema(branch as JsonSchema, `${path}.${keyword}[${index}]`)
    })
  }

  const type = schema.type
  const isObject = type === "object"
    || (Array.isArray(type) && type.includes("object"))
  if (isObject) {
    const properties = schema.properties as Record<string, JsonSchema> | undefined
    expect(properties, `${path}.properties`).toBeTypeOf("object")
    expect(schema.additionalProperties, `${path}.additionalProperties`).toBe(false)
    expect(
      new Set(Array.isArray(schema.required) ? schema.required : []),
      `${path}.required`,
    ).toEqual(new Set(Object.keys(properties ?? {})))
    for (const [name, property] of Object.entries(properties ?? {})) {
      assertStrictSchema(property, `${path}.properties.${name}`)
    }
  }

  const isArray = type === "array"
    || (Array.isArray(type) && type.includes("array"))
  if (isArray && schema.items && typeof schema.items === "object") {
    assertStrictSchema(schema.items as JsonSchema, `${path}.items`)
  }
}

function schemaAllowsNull(schema: JsonSchema): boolean {
  if (schema.type === "null") return true
  if (Array.isArray(schema.type) && schema.type.includes("null")) return true
  return (["anyOf", "oneOf"] as const).some((keyword) =>
    Array.isArray(schema[keyword])
    && schema[keyword].some((branch) =>
      branch
      && typeof branch === "object"
      && schemaAllowsNull(branch as JsonSchema)))
}

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
  it.each([400, 422])(
    "retries a %s rejected rich required-tool payload with the bounded simple form",
    (status) => {
      expect(shouldRetryCodexOAuthWithSimplePayload({
        status,
      detail: "invalid rich payload",
      hasTools: true,
      requiredToolChoice: true,
      hasMaxOutputTokens: true,
      messageCount: 3,
      hasStructuredConversation: true,
      })).toBe(true)
    },
  )

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
  it.each([
    [
      "done-only",
      [
        'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":"{\\"status\\":\\"complete\\"}"}',
        'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":4}}}',
      ].join("\n\n") + "\n\n",
    ],
    [
      "delta-and-done",
      [
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"{\\"status\\":\\"complete\\"}"}',
        'event: response.output_text.done\ndata: {"type":"response.output_text.done","text":"{\\"status\\":\\"complete\\"}"}',
        'event: response.completed\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":4}}}',
      ].join("\n\n") + "\n\n",
    ],
  ])("preserves one text chunk for a %s Responses stream", async (_label, stream) => {
    const dir = mkdtempSync(join(tmpdir(), "knowbee-codex-output-text-"))
    const authFilePath = join(dir, "auth.json")
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: "test-token" } }))
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })))

    try {
      const provider = new OpenAIProvider(
        { apiKeys: [], currentKeyIndex: 0, cooldowns: new Map() },
        undefined,
        { authFilePath },
      )
      const chunks = []
      for await (const chunk of provider.chat({
        model: "gpt-5.4",
        messages: [{ role: "user", content: "Return JSON." }],
      })) {
        chunks.push(chunk)
      }

      expect(chunks.filter((chunk) => chunk.type === "text_delta")).toEqual([{
        type: "text_delta",
        delta: '{"status":"complete"}',
      }])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("serializes the admitted camera tools as a valid strict required-tool contract", async () => {
    const dir = mkdtempSync(join(tmpdir(), "knowbee-codex-camera-tools-"))
    const authFilePath = join(dir, "auth.json")
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: "test-token" } }))
    const bodies: Array<Record<string, unknown>> = []
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
      return bodies.length === 1
        ? new Response("invalid rich payload", { status: 400 })
        : new Response("data: [DONE]\n\n", {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
    })
    vi.stubGlobal("fetch", fetchMock)

    const admittedTools = [
      telegramSendFileTool,
      yeonjangCameraCaptureTool,
      yeonjangCameraPermissionStatusTool,
    ].map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
    const originalSchemas = structuredClone(admittedTools.map((tool) => tool.input_schema))

    try {
      const provider = new OpenAIProvider(
        { apiKeys: [], currentKeyIndex: 0, cooldowns: new Map() },
        undefined,
        { authFilePath },
      )
      const consume = async (): Promise<void> => {
        for await (const _chunk of provider.chat({
          model: "gpt-5.4",
          system: "Use the available camera tools.",
          messages: [{ role: "user", content: "Capture one photo and send it." }],
          tools: admittedTools,
          toolChoice: "required",
        })) {
          // Consume the stream.
        }
      }

      await expect(consume()).resolves.toBeUndefined()
      expect(bodies).toHaveLength(2)
      expect(bodies[0]?.tool_choice).toBe("required")
      expect(bodies[1]?.tool_choice).toBe("required")
      expect(bodies[1]?.tools).toEqual(bodies[0]?.tools)
      expect(bodies[1]).not.toHaveProperty("max_output_tokens")
      expect(bodies[1]?.input).toEqual([
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "User: Capture one photo and send it.",
            },
          ],
        },
      ])

      const tools = bodies[0]?.tools as Array<{
        name: string
        parameters: JsonSchema
        strict: boolean
      }>
      expect(tools.map((tool) => tool.name)).toEqual(admittedTools.map((tool) => tool.name))
      for (const tool of tools) {
        expect(tool.strict).toBe(true)
        assertStrictSchema(tool.parameters, `tools.${tool.name}.parameters`)
      }
      expect(admittedTools.map((tool) => tool.input_schema)).toEqual(originalSchemas)

      const captureSchema = tools.find((tool) =>
        tool.name === "yeonjang_camera_capture")?.parameters
      const targetSelector = (captureSchema?.properties as Record<string, JsonSchema>)
        ?.targetSelector
      expect(targetSelector).toBeDefined()
      expect(schemaAllowsNull(targetSelector as JsonSchema)).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("reuses a successful simplified payload for later calls on the same provider", async () => {
    const dir = mkdtempSync(join(tmpdir(), "knowbee-codex-simple-payload-memory-"))
    const authFilePath = join(dir, "auth.json")
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: "test-token" } }))
    const bodies: Array<Record<string, unknown>> = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
      return bodies.length === 1
        ? new Response("invalid rich payload", { status: 400 })
        : new Response("data: [DONE]\n\n", {
            status: 200,
            headers: { "Content-Type": "text/event-stream" },
          })
    }))

    try {
      const provider = new OpenAIProvider(
        { apiKeys: [], currentKeyIndex: 0, cooldowns: new Map() },
        undefined,
        { authFilePath },
      )
      const consume = async (): Promise<void> => {
        for await (const _chunk of provider.chat({
          model: "gpt-5.4",
          messages: [{ role: "user", content: "Return the result." }],
          maxTokens: 1_000,
        })) {
          // Consume the stream.
        }
      }

      await consume()
      await consume()

      expect(bodies).toHaveLength(3)
      expect(bodies[0]).toHaveProperty("max_output_tokens", 1_000)
      expect(bodies[1]).not.toHaveProperty("max_output_tokens")
      expect(bodies[2]).not.toHaveProperty("max_output_tokens")
      expect(bodies[2]?.input).toEqual(bodies[1]?.input)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("normalizes optional oneOf and allOf branches without mutating the source schema", async () => {
    const dir = mkdtempSync(join(tmpdir(), "knowbee-codex-composition-tools-"))
    const authFilePath = join(dir, "auth.json")
    writeFileSync(authFilePath, JSON.stringify({ tokens: { access_token: "test-token" } }))
    const bodies: Array<Record<string, unknown>> = []
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>)
      return new Response("invalid rich payload", { status: 400 })
    }))
    const sourceSchema = {
      type: "object" as const,
      properties: {
        choice: {
          oneOf: [{
            type: "object",
            properties: {
              kind: { type: "string", const: "one" },
              note: { type: "string" },
            },
            required: ["kind"],
          }],
        },
        combined: {
          allOf: [{
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              labels: {
                type: "array",
                items: {
                  type: "object",
                  properties: { value: { type: "string" } },
                  required: [],
                },
              },
            },
            required: ["enabled"],
          }],
        },
      },
      required: [],
    }
    const originalSchema = structuredClone(sourceSchema)

    try {
      const provider = new OpenAIProvider(
        { apiKeys: [], currentKeyIndex: 0, cooldowns: new Map() },
        undefined,
        { authFilePath },
      )
      const consume = async (): Promise<void> => {
        for await (const _chunk of provider.chat({
          model: "gpt-5.4",
          messages: [{ role: "user", content: "Use the test tool." }],
          tools: [{
            name: "composition_test",
            description: "Exercise supported composition schemas.",
            input_schema: sourceSchema,
          }],
          toolChoice: "required",
        })) {
          // Consume the stream.
        }
      }

      await expect(consume()).rejects.toMatchObject({
        reasonCode: "provider_contract_rejected",
      })
      const tools = bodies[0]?.tools as Array<{ parameters: JsonSchema }>
      const parameters = tools[0]?.parameters
      expect(parameters).toBeDefined()
      assertStrictSchema(parameters as JsonSchema)
      const properties = parameters?.properties as Record<string, JsonSchema>
      expect(schemaAllowsNull(properties.choice)).toBe(true)
      expect(schemaAllowsNull(properties.combined)).toBe(true)
      expect(sourceSchema).toEqual(originalSchema)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it("does not repeat the simplified required-tool contract after its rejection", async () => {
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
      expect(bodies).toHaveLength(2)
      expect(bodies[1]?.tool_choice).toBe("required")
      expect(bodies[1]?.tools).toEqual(bodies[0]?.tools)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
