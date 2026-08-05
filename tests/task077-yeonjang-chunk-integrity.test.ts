import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createYeonjangChunkAssembler } from "../packages/core/src/yeonjang/mqtt-client.ts"

function digest(payload: Buffer): string {
  return `sha256:${createHash("sha256").update(payload).digest("hex")}`
}

function chunks(payload: Buffer) {
  const midpoint = Math.ceil(payload.length / 2)
  const parts = [payload.subarray(0, midpoint), payload.subarray(midpoint)]
  return parts.map((part, chunkIndex) => ({
    transport: "chunk" as const,
    id: "chunk-request",
    chunk_index: chunkIndex,
    chunk_count: parts.length,
    total_size_bytes: payload.length,
    payload_digest: digest(payload),
    encoding: "base64" as const,
    mime_type: "application/json",
    base64_data: part.toString("base64"),
  }))
}

describe("Yeonjang MQTT response chunk integrity", () => {
  it("reassembles valid out-of-order chunks only after exact size and digest verification", () => {
    const payload = Buffer.from(JSON.stringify({ id: "chunk-request", ok: true, result: { value: 1 } }))
    const [first, second] = chunks(payload)
    const assembler = createYeonjangChunkAssembler({
      requestId: "chunk-request",
      maxTotalBytes: 1024,
      maxChunkCount: 4,
    })

    expect(assembler.accept(second)).toEqual({ kind: "pending" })
    const result = assembler.accept(first)
    expect(result.kind).toBe("complete")
    if (result.kind === "complete") expect(result.payload).toEqual(payload)
  })

  it.each([
    ["mixed count", (items: ReturnType<typeof chunks>) => ({ ...items[1], chunk_count: 3 })],
    ["mixed size", (items: ReturnType<typeof chunks>) => ({ ...items[1], total_size_bytes: 999 })],
    ["wrong digest", (items: ReturnType<typeof chunks>) => ({ ...items[1], payload_digest: `sha256:${"0".repeat(64)}` })],
    ["wrong id", (items: ReturnType<typeof chunks>) => ({ ...items[1], id: "another-request" })],
  ])("rejects %s without exposing partial payload", (_name, mutate) => {
    const payload = Buffer.from(JSON.stringify({ id: "chunk-request", ok: true }))
    const items = chunks(payload)
    const assembler = createYeonjangChunkAssembler({
      requestId: "chunk-request",
      maxTotalBytes: 1024,
      maxChunkCount: 4,
    })

    expect(assembler.accept(items[0])).toEqual({ kind: "pending" })
    expect(assembler.accept(mutate(items))).toEqual({
      kind: "rejected",
      code: "invalid_response_chunk",
    })
  })

  it("rejects a conflicting duplicate and an oversized envelope", () => {
    const payload = Buffer.from(JSON.stringify({ id: "chunk-request", ok: true }))
    const items = chunks(payload)
    const duplicateAssembler = createYeonjangChunkAssembler({
      requestId: "chunk-request",
      maxTotalBytes: 1024,
      maxChunkCount: 4,
    })
    expect(duplicateAssembler.accept(items[0])).toEqual({ kind: "pending" })
    expect(
      duplicateAssembler.accept({
        ...items[0],
        base64_data: Buffer.from("different").toString("base64"),
      }),
    ).toEqual({ kind: "rejected", code: "invalid_response_chunk" })

    const boundedAssembler = createYeonjangChunkAssembler({
      requestId: "chunk-request",
      maxTotalBytes: payload.length - 1,
      maxChunkCount: 4,
    })
    expect(boundedAssembler.accept(items[0])).toEqual({
      kind: "rejected",
      code: "response_chunk_too_large",
    })
  })
})
