import { describe, expect, it } from "vitest"

import type { PerformanceAcceptanceMatrixCandidate } from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  type RepresentativeFlowId,
  auditRepresentativeFlowBaseline,
  buildMeasuredRepresentativeFlowSample,
} from "../packages/core/src/maintenance/performance-baseline.ts"
import type { SelectedPerformanceAcceptanceMatrix } from "../packages/core/src/release/performance-acceptance-authorization.ts"
import { buildPerformanceAcceptanceEvidence } from "../packages/core/src/release/performance-acceptance-evidence.ts"

const threshold = {
  maxLatencyRegressionRatio: 2,
  maxLlmCallIncrease: 1,
  maxAttemptIncrease: 1,
}
const matrix: PerformanceAcceptanceMatrixCandidate = {
  schemaVersion: 1,
  matrixId: "performance-matrix:task135",
  matrixVersion: 1,
  baselineVersion: "performance-baseline:v1",
  baselineSnapshot: {
    schemaVersion: 1,
    baselineVersion: "performance-baseline:v1",
    flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
      flowId,
      latencyP95Ms: 100,
      llmCallCount: 1,
      attemptCount: 1,
    })),
  },
  thresholds: Object.fromEntries(
    REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [flowId, { ...threshold }]),
  ),
}
const selected: SelectedPerformanceAcceptanceMatrix = {
  status: "selected",
  candidate: matrix,
  authorizationPort: {
    resolve: () => ({
      schemaVersion: 1,
      authorizationId: "performance-authorization:task135",
      decision: "approved",
      actorType: "administrator",
      actorId: "administrator:task135",
      scope: "performance_release_gate",
      matrixId: matrix.matrixId,
      matrixVersion: matrix.matrixVersion,
      baselineVersion: matrix.baselineVersion,
      thresholdSnapshot: matrix.thresholds,
      baselineSnapshot: matrix.baselineSnapshot,
      approvedAt: 100,
    }),
  },
}
const baseline = auditRepresentativeFlowBaseline({
  fixtureVersion: matrix.baselineVersion,
  sourceKind: "deterministic_fixture",
  samples: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId, index) => ({
    flowId,
    sampleId: `baseline:${index}`,
    durationMs: 100,
    llmCallCount: 1,
    inputTokens: 10,
    outputTokens: 5,
    costEstimateUsd: 0,
    attemptCount: 1,
    queueWaitMs: 0,
    eventBytes: 10,
    evidenceBytes: 10,
  })),
})

function live(flowId: RepresentativeFlowId, durationMs = 120) {
  return buildMeasuredRepresentativeFlowSample({
    flowId,
    sampleId: `live:${flowId}`,
    startedAt: 100,
    finishedAt: 100 + durationMs,
    llmReceipts: [
      {
        invocationId: `invocation:${flowId}`,
        phase: "completed",
        at: 100 + durationMs,
        durationMs,
        inputTokens: 10,
        outputTokens: 5,
        context: { stage: "execution" },
      },
    ],
    costEstimateUsd: 0,
    attemptCount: 1,
    queueWaitMs: 0,
    eventBytes: 10,
    evidenceBytes: 10,
  })
}

const samples = () => REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => live(flowId))

describe("task135 performance acceptance evidence", () => {
  it("accepts only when all five bound flows are accepted", () => {
    expect(buildPerformanceAcceptanceEvidence({ selected, baseline, samples: samples() })).toEqual({
      status: "accepted",
      matrixId: matrix.matrixId,
      matrixVersion: matrix.matrixVersion,
      baselineVersion: matrix.baselineVersion,
      authorizationId: "performance-authorization:task135",
      reasonCodes: [],
    })
  })

  it("rejects a complete set when any flow exceeds its approved threshold", () => {
    const measured = samples().map((sample) =>
      sample.flowId === "current_fact_read" ? live(sample.flowId, 300) : sample,
    )
    expect(
      buildPerformanceAcceptanceEvidence({ selected, baseline, samples: measured }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: expect.arrayContaining(["flow:current_fact_read:latency_regression_exceeded"]),
    })
  })

  it.each([
    ["missing", samples().slice(1), "performance_flow_missing:direct_answer"],
    [
      "duplicate",
      [...samples(), live("direct_answer")],
      "performance_flow_duplicate:direct_answer",
    ],
    [
      "incomplete",
      samples().map((sample) =>
        sample.flowId === "cancel" ? { ...sample, complete: false, diagnostics: ["test"] } : sample,
      ),
      "flow:cancel:live_measurement_incomplete",
    ],
  ])("keeps %s sample sets baseline-only", (_kind, measured, reasonCode) => {
    expect(
      buildPerformanceAcceptanceEvidence({ selected, baseline, samples: measured }),
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: expect.arrayContaining([reasonCode]),
    })
  })

  it("keeps a mismatched baseline baseline-only", () => {
    expect(
      buildPerformanceAcceptanceEvidence({
        selected,
        baseline: { ...baseline, fixtureVersion: "performance-baseline:v2" },
        samples: samples(),
      }),
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["performance_baseline_binding_mismatch"],
    })
  })
})
