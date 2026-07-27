import { describe, expect, it } from "vitest"

import type { LatencyMetricRecord } from "../packages/core/src/observability/latency.ts"
import {
  RELEASE_PERFORMANCE_TARGETS,
  type ReleasePerformanceAcceptanceEvidence,
  buildReleasePerformanceSummary,
} from "../packages/core/src/release/performance-gate.ts"
import { buildSubAgentReleaseReadinessSummary } from "../packages/core/src/release/sub-agent-release-gate.ts"

const now = new Date("2026-07-17T00:00:00.000Z")

function healthyMetrics(): LatencyMetricRecord[] {
  return RELEASE_PERFORMANCE_TARGETS.flatMap((target, index) =>
    target.metricName
      ? [
          {
            id: `metric:${index}`,
            name: target.metricName,
            durationMs: 1,
            budgetMs: target.budgetMs ?? 1,
            status: "ok" as const,
            createdAt: now.getTime(),
          },
        ]
      : [],
  )
}

function acceptance(
  status: ReleasePerformanceAcceptanceEvidence["status"],
): ReleasePerformanceAcceptanceEvidence {
  return {
    status,
    matrixId: "matrix:fixture",
    matrixVersion: 1,
    baselineVersion: "baseline:fixture:v1",
    authorizationId: "authorization:fixture",
    reasonCodes: status === "rejected" ? ["latency_regression_exceeded"] : [],
  }
}

describe("task126 release performance acceptance", () => {
  it("does not pass healthy operational metrics without approved acceptance evidence", () => {
    const summary = buildReleasePerformanceSummary({ now, metrics: healthyMetrics() })

    expect(summary).toMatchObject({
      gateStatus: "failed",
      acceptance: {
        status: "baseline_only",
        reasonCodes: ["performance_acceptance_evidence_missing"],
      },
    })
    expect(summary.blockingFailures).toContain("performance_acceptance_evidence_missing")
  })

  it("passes healthy metrics only with complete accepted evidence", () => {
    const summary = buildReleasePerformanceSummary({
      now,
      metrics: healthyMetrics(),
      acceptanceEvidence: acceptance("accepted"),
    })

    expect(summary.gateStatus).toBe("passed")
    expect(summary.acceptance).toMatchObject({ status: "accepted", matrixId: "matrix:fixture" })
  })

  it("fails explicit rejection even when operational metrics are healthy", () => {
    const summary = buildReleasePerformanceSummary({
      now,
      metrics: healthyMetrics(),
      acceptanceEvidence: acceptance("rejected"),
    })

    expect(summary.gateStatus).toBe("failed")
    expect(summary.blockingFailures).toContain("performance_acceptance_rejected")
  })

  it("keeps an operational timeout blocking even with accepted evidence", () => {
    const metrics = healthyMetrics()
    const first = metrics[0]
    if (!first) throw new Error("at least one operational metric is required")
    metrics[0] = { ...first, status: "timeout", durationMs: first.budgetMs + 1 }
    const summary = buildReleasePerformanceSummary({
      now,
      metrics,
      acceptanceEvidence: acceptance("accepted"),
    })

    expect(summary).toMatchObject({
      gateStatus: "failed",
      operationalStatus: "failed",
      acceptance: { status: "accepted" },
    })
    expect(summary.blockingFailures).toContain("intake_latency: timeout recorded")
  })

  it("blocks limited-beta readiness when performance acceptance is baseline-only", () => {
    const summary = buildSubAgentReleaseReadinessSummary({ now })

    expect(summary.gateStatus).toBe("failed")
    expect(summary.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "performance_acceptance", required: true, status: "failed" }),
      ]),
    )
  })
})
