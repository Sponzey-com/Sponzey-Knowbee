import { describe, expect, it } from "vitest"
import {
  createLiveSmokeFirstResponseLatencyReader,
} from "../packages/core/src/channels/live-smoke-latency-evidence.ts"
import type {
  LatencyMetricRecord,
} from "../packages/core/src/observability/latency.ts"

function metric(
  id: string,
  runId: string,
  requestGroupId: string,
  durationMs: number,
  createdAt: number,
): LatencyMetricRecord {
  return {
    id,
    name: "first_response_latency_ms",
    durationMs,
    budgetMs: 30_000,
    status: durationMs <= 30_000 ? "ok" : "timeout",
    createdAt,
    runId,
    requestGroupId,
    source: "webui",
  }
}

describe("live smoke first-response latency evidence", () => {
  it("selects the latest metric bound to the exact run and request group", () => {
    const read = createLiveSmokeFirstResponseLatencyReader({
      list: () => [
        metric("old", "run:live", "run:live", 900, 1),
        metric("other-run", "run:other", "run:other", 100, 2),
        metric("other-group", "run:live", "group:other", 200, 3),
        metric("latest", "run:live", "run:live", 1_200, 4),
      ],
    })

    expect(read("run:live", "run:live")).toEqual({
      metricId: "latest",
      runId: "run:live",
      requestGroupId: "run:live",
      durationMs: 1_200,
      budgetMs: 30_000,
      status: "ok",
    })
  })

  it("does not reuse stale or cross-run latency evidence", () => {
    const read = createLiveSmokeFirstResponseLatencyReader({
      list: () => [metric("other", "run:other", "run:other", 100, 1)],
    })

    expect(read("run:live", "run:live")).toBeUndefined()
  })
})
