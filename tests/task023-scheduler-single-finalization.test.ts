import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { executeCanonicalScheduledRequest } from "../packages/core/src/scheduler/index.ts"

function schedule() {
  return {
    id: "schedule-task023",
    name: "TASK023 schedule",
    prompt: "Produce one verified final response.",
    model: null,
  } as never
}

function startIngressResult(params: {
  runId?: string
  sessionId?: string
  status: "completed" | "failed"
  summary: string
}) {
  return {
    started: {
      runId: params.runId,
      sessionId: params.sessionId,
      status: "started" as const,
      finished: Promise.resolve({ status: params.status, summary: params.summary }),
    },
  } as never
}

const baseParams = {
  artifactStorage: {} as never,
  memoryJournal: {} as never,
  hierarchyStorage: {} as never,
  schedule: schedule(),
  scheduleRunId: "run-task023",
  config: DEFAULT_CONFIG,
}

describe("task023 scheduler single finalization", () => {
  it("uses the canonical final chunk without a second renderer", async () => {
    const startIngressRunImpl = vi.fn((params) => {
      params.onChunk?.({ type: "text", delta: "canonical final", textSource: "llm_reviewed" })
      params.onChunk?.({ type: "done", totalTokens: 0 })
      return startIngressResult({
        runId: params.runId,
        sessionId: params.sessionId,
        status: "completed",
        summary: "canonical final",
      })
    })

    const result = await executeCanonicalScheduledRequest(baseParams, {
      startIngressRunImpl: startIngressRunImpl as never,
    })

    expect(result).toEqual({
      success: true,
      summary: "canonical final",
      error: null,
      executionSuccess: true,
      deliverySuccess: null,
    })
    const source = readFileSync("packages/core/src/scheduler/index.ts", "utf8")
    expect(source).not.toContain("renderScheduledFinalResponse")
    expect(source).not.toContain("buildFinalResponseIdentityContext")
  })

  it("discards collected text when the canonical run does not complete", async () => {
    const startIngressRunImpl = vi.fn((params) => {
      params.onChunk?.({
        type: "text",
        delta: "RAW_INTERMEDIATE_TEXT",
        textSource: "llm_generated",
      })
      return startIngressResult({
        runId: params.runId,
        sessionId: params.sessionId,
        status: "failed",
        summary: "canonical review failed",
      })
    })

    const result = await executeCanonicalScheduledRequest(baseParams, {
      startIngressRunImpl: startIngressRunImpl as never,
    })

    expect(result).toMatchObject({
      success: false,
      summary: null,
      error: "canonical review failed",
      executionSuccess: false,
      deliverySuccess: null,
      retryable: false,
    })
    expect(JSON.stringify(result)).not.toContain("RAW_INTERMEDIATE_TEXT")
  })

  it("rejects a completed run without canonical final output", async () => {
    const startIngressRunImpl = vi.fn((params) =>
      startIngressResult({
        runId: params.runId,
        sessionId: params.sessionId,
        status: "completed",
        summary: "",
      }),
    )

    await expect(
      executeCanonicalScheduledRequest(baseParams, {
        startIngressRunImpl: startIngressRunImpl as never,
      }),
    ).resolves.toMatchObject({
      success: false,
      summary: null,
      error: "canonical scheduled run produced no final output",
      executionSuccess: true,
      deliverySuccess: false,
      retryable: false,
    })
  })
})
