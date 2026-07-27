import { describe, expect, it } from "vitest"

import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  type RepresentativeFlowSample,
  auditRepresentativeFlowBaseline,
} from "../packages/core/src/maintenance/performance-baseline.js"

function samples(): RepresentativeFlowSample[] {
  return REQUIRED_REPRESENTATIVE_FLOW_IDS.flatMap((flowId, index) =>
    [10, 20].map((durationMs, sampleIndex) => ({
      flowId,
      sampleId: `secret-label-${index}-${sampleIndex}`,
      durationMs: durationMs + index,
      llmCallCount: index,
      inputTokens: index * 10,
      outputTokens: index * 5,
      costEstimateUsd: index * 0.001,
      attemptCount: index + 1,
      queueWaitMs: index * 2,
      eventBytes: 100 + index,
      evidenceBytes: 200 + index,
    })),
  )
}

describe("task005 representative flow baseline", () => {
  it("creates stable per-flow percentiles and aggregate totals", () => {
    const result = auditRepresentativeFlowBaseline({
      fixtureVersion: "phase0:v1",
      sourceKind: "deterministic_fixture",
      samples: samples().reverse(),
    })

    expect(result.complete).toBe(true)
    expect(result.flows.map((flow) => flow.flowId)).toEqual([...REQUIRED_REPRESENTATIVE_FLOW_IDS])
    expect(result.flows[0]).toMatchObject({ sampleCount: 2, latencyP50Ms: 10, latencyP95Ms: 20 })
    expect(result.aggregate).toMatchObject({
      sampleCount: 10,
      eventBytes: 1020,
      evidenceBytes: 2020,
    })
    expect(result.diagnostics).toEqual([])
    expect(JSON.stringify(result)).not.toContain("secret-label")
  })

  it("fails closed for missing and duplicate flows and invalid metrics", () => {
    const fixture = samples().filter((sample) => sample.flowId !== "cancel")
    const invalid = fixture[0]
    if (!invalid) throw new Error("performance fixture must contain a sample")
    fixture.push({ ...invalid, flowId: "direct_answer", durationMs: -1 })
    const result = auditRepresentativeFlowBaseline({
      fixtureVersion: "phase0:v1",
      sourceKind: "deterministic_fixture",
      samples: fixture,
    })

    expect(result.complete).toBe(false)
    expect(result.diagnostics.map((item) => item.code)).toEqual(
      expect.arrayContaining(["required_flow_missing", "sample_metric_invalid"]),
    )
  })
})
