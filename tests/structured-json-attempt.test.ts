import { describe, expect, it } from "vitest"

import {
  collectStructuredJsonAttempt,
  type StructuredJsonAttemptResult,
} from "../packages/core/src/ai/structured-json-attempt.ts"
import type { AIChunk, AIProvider, ChatParams } from "../packages/core/src/ai/types.ts"

class FakeProvider implements AIProvider {
  readonly id = "fake"
  readonly supportedModels = ["fake-model"]
  readonly calls: ChatParams[] = []

  constructor(
    private readonly execute: (params: ChatParams) => AsyncGenerator<AIChunk>,
  ) {}

  maxContextTokens(): number {
    return 16_000
  }

  chat(params: ChatParams): AsyncGenerator<AIChunk> {
    this.calls.push(params)
    return this.execute(params)
  }
}

function chunks(...values: string[]): (params: ChatParams) => AsyncGenerator<AIChunk> {
  return async function* () {
    for (const value of values) {
      yield { type: "text_delta", delta: value }
    }
    yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } }
  }
}

function runAttempt(
  provider: AIProvider,
  overrides: {
    deadlineMs?: number
    maxVisibleTextBytes?: number
    signal?: AbortSignal
  } = {},
): Promise<StructuredJsonAttemptResult> {
  return collectStructuredJsonAttempt({
    provider,
    chatParams: {
      model: "fake-model",
      messages: [{ role: "user", content: "return JSON" }],
      maxTokens: 128,
      ...(overrides.signal ? { signal: overrides.signal } : {}),
    },
    deadlineMs: overrides.deadlineMs ?? 100,
    maxVisibleTextBytes: overrides.maxVisibleTextBytes ?? 1024,
  })
}

describe("structured JSON single-attempt collection", () => {
  it("collects text deltas and returns a parsed object without raw output", async () => {
    const provider = new FakeProvider(chunks('{"answer":', '"ok"}'))

    const result = await runAttempt(provider)

    expect(result).toEqual({ status: "parsed", value: { answer: "ok" } })
    expect(provider.calls).toHaveLength(1)
    expect(provider.calls[0]?.maxTokens).toBe(128)
    expect(provider.calls[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(result).not.toHaveProperty("rawOutput")
  })

  it.each([
    ["invalid_json", "not-json"],
    ["json_object_required", "[]"],
  ] as const)("returns %s without echoing malformed output", async (status, output) => {
    const result = await runAttempt(new FakeProvider(chunks(output)))

    expect(result).toEqual({ status })
    expect(JSON.stringify(result)).not.toContain(output)
  })

  it("measures the visible output limit in UTF-8 bytes and aborts the attempt", async () => {
    let observedSignal: AbortSignal | undefined
    const provider = new FakeProvider(async function* (params) {
      observedSignal = params.signal
      yield { type: "text_delta", delta: '{"value":"가"}' }
      yield { type: "message_stop", usage: { input_tokens: 1, output_tokens: 1 } }
    })

    const result = await runAttempt(provider, { maxVisibleTextBytes: 12 })

    expect(result).toEqual({ status: "output_limit_exceeded" })
    expect(observedSignal?.aborted).toBe(true)
  })

  it("returns provider_failed when the provider throws", async () => {
    const provider = new FakeProvider(async function* () {
      throw new Error("secret provider payload")
    })

    const result = await runAttempt(provider)

    expect(result).toEqual({
      status: "provider_failed",
      reasonCode: "provider_unavailable",
    })
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  it("aborts a stalled provider at the deadline", async () => {
    const provider = new FakeProvider(async function* (params) {
      await new Promise<void>((resolve) => {
        params.signal?.addEventListener("abort", () => resolve(), { once: true })
      })
      throw params.signal?.reason
    })

    const result = await runAttempt(provider, { deadlineMs: 5 })

    expect(result).toEqual({ status: "timed_out" })
  })

  it("distinguishes caller cancellation from timeout", async () => {
    const caller = new AbortController()
    const provider = new FakeProvider(async function* (params) {
      await new Promise<void>((resolve) => {
        params.signal?.addEventListener("abort", () => resolve(), { once: true })
      })
      throw params.signal?.reason
    })
    const pending = runAttempt(provider, { deadlineMs: 100, signal: caller.signal })

    caller.abort()

    await expect(pending).resolves.toEqual({ status: "cancelled" })
  })
})
