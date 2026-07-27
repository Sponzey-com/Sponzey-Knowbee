import { describe, expect, it } from "vitest"
import {
  buildCanonicalResponseLatencyAttribution,
} from "../packages/core/src/observability/canonical-response-latency-attribution.ts"
import type { LlmInvocationReceipt } from "../packages/core/src/observability/llm-invocation-receipt.ts"
import type { LatencyMetricRecord } from "../packages/core/src/observability/latency.ts"

const runId = "run:latency-attribution"
const requestGroupId = "request-group:latency-attribution"

function llmReceipt(
  invocationId: string,
  stage: LlmInvocationReceipt["context"]["stage"],
  durationMs: number,
  correlation: { runId?: string; requestGroupId?: string } = {
    runId,
    requestGroupId,
  },
): LlmInvocationReceipt {
  return {
    schemaVersion: 1,
    invocationId,
    phase: "completed",
    at: 100 + durationMs,
    context: {
      ...correlation,
      stage,
      operationCode: stage === "intake" ? "task_intake" : stage,
    },
    durationMs,
  }
}

function metric(
  id: string,
  name: LatencyMetricRecord["name"],
  durationMs: number,
  stageCode: "tool_transport" | "delivery",
): LatencyMetricRecord {
  return {
    id,
    name,
    durationMs,
    budgetMs: 30_000,
    status: "ok",
    createdAt: 200 + durationMs,
    runId,
    requestGroupId,
    source: "canonical_response",
    detail: {
      stageCode,
      reasonCode: stageCode === "tool_transport" ? "tool_dispatch" : "channel_delivery",
      rawPrompt: "must-not-project",
      targetId: "must-not-project",
    },
  }
}

describe("canonical response latency attribution", () => {
  it("binds every stage to one exact run and returns the two longest stages", () => {
    const result = buildCanonicalResponseLatencyAttribution({
      runId,
      requestGroupId,
      llmReceipts: [
        llmReceipt("invoke:intake", "intake", 12_000, { requestGroupId }),
        llmReceipt("invoke:execution", "execution", 31_000),
        llmReceipt("invoke:review", "review", 27_000),
        llmReceipt("invoke:final", "final_response", 8_000),
        llmReceipt("invoke:foreign", "execution", 99_000, {
          runId: "run:foreign",
          requestGroupId,
        }),
      ],
      latencyMetrics: [
        metric("metric:tool", "execution_latency_ms", 18_000, "tool_transport"),
        metric("metric:delivery", "delivery_latency_ms", 1_000, "delivery"),
      ],
    })

    expect(result.status).toBe("complete")
    expect(result.stages.map((stage) => stage.stage)).toEqual([
      "task_intake",
      "execution_decision",
      "tool_transport",
      "completion_review",
      "final_response",
      "delivery",
    ])
    expect(result.longestStages).toEqual([
      expect.objectContaining({ stage: "execution_decision", durationMs: 31_000 }),
      expect.objectContaining({ stage: "completion_review", durationMs: 27_000 }),
    ])
    expect(JSON.stringify(result)).not.toMatch(/must-not-project|rawPrompt|targetId|run:foreign/u)
  })

  it("returns an explicit incomplete result when a required stage is absent", () => {
    const result = buildCanonicalResponseLatencyAttribution({
      runId,
      requestGroupId,
      llmReceipts: [
        llmReceipt("invoke:intake", "intake", 12_000, { requestGroupId }),
        llmReceipt("invoke:execution", "execution", 31_000),
      ],
      latencyMetrics: [],
    })

    expect(result.status).toBe("incomplete")
    expect(result.missingStages).toEqual([
      "tool_transport",
      "completion_review",
      "final_response",
      "delivery",
    ])
  })
})
