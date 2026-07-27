import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { buildMemoryInjectionContext, type DetailedMemorySearchResult } from "../packages/core/src/memory/store.ts"
import { buildFlashFeedbackContext, recordFlashFeedback } from "../packages/core/src/memory/flash-feedback.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture
beforeEach(() => { dbRuntime = createTestDbRuntimeFixture("knowbee-memory-context-en-") })
afterEach(() => { dbRuntime.dispose() })

function createMemoryResult(content: string): DetailedMemorySearchResult {
  return {
    chunkId: "chunk-task0048",
    source: "fts",
    score: 0.91,
    latencyMs: 1,
    chunk: {
      id: "chunk-task0048",
      document_id: "doc-task0048",
      scope: "global",
      owner_id: "global",
      ordinal: 0,
      token_estimate: 10,
      content,
      checksum: "checksum",
      source_checksum: null,
      metadata_json: null,
      created_at: Date.now(),
      updated_at: Date.now(),
      document_title: null,
      document_source_type: "test",
      document_source_ref: null,
      document_metadata_json: null,
      score: 0.91,
    },
  }
}

describe("task0048 memory prompt context English normalization", () => {
  it("renders memory injection heading in English while preserving memory content", () => {
    const context = buildMemoryInjectionContext([
      createMemoryResult("사용자가 선호하는 응답은 간결함입니다."),
    ])

    expect(context).toContain("[Relevant Memory]")
    expect(context).toContain("사용자가 선호하는 응답은 간결함입니다.")
    expect(context).not.toContain("[관련 기억]")
  })

  it("renders flash feedback heading and TTL note in English while preserving feedback content", () => {
    const sessionId = `session-task0048-${Date.now()}`
    recordFlashFeedback({
      sessionId,
      content: "텔레그램 전송하지 마",
      severity: "high",
      ttlMs: 60_000,
    })

    const context = buildFlashFeedbackContext({ sessionId })

    expect(context).toContain("[Immediate User Feedback]")
    expect(context).toContain("텔레그램 전송하지 마")
    expect(context).toContain("short-lived execution correction")
    expect(context).not.toContain("[즉시 반영할 사용자 피드백]")
    expect(context).not.toContain("장기 규칙")
  })
})
