import { describe, expect, it } from "vitest"

import {
  type PerformanceAcceptanceAuthorizationReceipt,
  type PerformanceAcceptanceMatrixCandidate,
  activatePerformanceAcceptanceMatrix,
  validatePerformanceAcceptanceMatrix,
} from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  auditRepresentativeFlowBaseline,
  buildMeasuredRepresentativeFlowSample,
} from "../packages/core/src/maintenance/performance-baseline.ts"
import type { SelectedPerformanceAcceptanceMatrix } from "../packages/core/src/release/performance-acceptance-authorization.ts"
import { buildPerformanceAcceptanceEvidence } from "../packages/core/src/release/performance-acceptance-evidence.ts"

const baselineVersion = "performance-baseline:task136:v1"
const baseline = auditRepresentativeFlowBaseline({
  fixtureVersion: baselineVersion,
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
const baselineSnapshot = {
  schemaVersion: 1 as const,
  baselineVersion,
  flows: baseline.flows.map((flow) => ({
    flowId: flow.flowId,
    latencyP95Ms: flow.latencyP95Ms,
    llmCallCount: flow.llmCallCount,
    attemptCount: flow.attemptCount,
  })),
}
const threshold = {
  maxLatencyRegressionRatio: 2,
  maxLlmCallIncrease: 1,
  maxAttemptIncrease: 1,
}
const candidate = {
  schemaVersion: 1 as const,
  matrixId: "performance-matrix:task136",
  matrixVersion: 1,
  baselineVersion,
  baselineSnapshot,
  thresholds: Object.fromEntries(
    REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => [flowId, { ...threshold }]),
  ),
} as PerformanceAcceptanceMatrixCandidate
const receipt = {
  schemaVersion: 1 as const,
  authorizationId: "performance-authorization:task136",
  decision: "approved" as const,
  actorType: "administrator" as const,
  actorId: "administrator:task136",
  scope: "performance_release_gate" as const,
  matrixId: candidate.matrixId,
  matrixVersion: candidate.matrixVersion,
  baselineVersion,
  thresholdSnapshot: candidate.thresholds,
  baselineSnapshot,
  approvedAt: 100,
} as PerformanceAcceptanceAuthorizationReceipt

function selected(
  authorization: PerformanceAcceptanceAuthorizationReceipt = receipt,
): SelectedPerformanceAcceptanceMatrix {
  return {
    status: "selected",
    candidate,
    authorizationPort: { resolve: () => authorization },
  }
}

function samples() {
  return REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) =>
    buildMeasuredRepresentativeFlowSample({
      flowId,
      sampleId: `live:${flowId}`,
      startedAt: 100,
      finishedAt: 400,
      llmReceipts: [
        {
          invocationId: `invocation:${flowId}`,
          phase: "completed",
          at: 400,
          durationMs: 300,
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
    }),
  )
}

describe("task136 performance baseline snapshot binding", () => {
  it("rejects incomplete, duplicate, and unknown baseline snapshots", () => {
    const incomplete = {
      ...candidate,
      baselineSnapshot: { ...baselineSnapshot, flows: baselineSnapshot.flows.slice(1) },
    } as PerformanceAcceptanceMatrixCandidate
    const duplicate = {
      ...candidate,
      baselineSnapshot: {
        ...baselineSnapshot,
        flows: [...baselineSnapshot.flows, baselineSnapshot.flows[0]],
      },
    } as PerformanceAcceptanceMatrixCandidate
    const unknown = {
      ...candidate,
      baselineSnapshot: {
        ...baselineSnapshot,
        flows: [
          ...baselineSnapshot.flows.slice(1),
          { ...baselineSnapshot.flows[0], flowId: "other" },
        ],
      },
    } as PerformanceAcceptanceMatrixCandidate

    expect(validatePerformanceAcceptanceMatrix(incomplete)).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_baseline_flow_missing:direct_answer"],
    })
    expect(validatePerformanceAcceptanceMatrix(duplicate)).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_baseline_flow_duplicate:direct_answer"],
    })
    expect(validatePerformanceAcceptanceMatrix(unknown)).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_baseline_flow_unknown:other"],
    })
  })

  it("rejects legacy authorization receipts without the approved baseline snapshot", () => {
    const { baselineSnapshot: _omitted, ...legacy } =
      receipt as PerformanceAcceptanceAuthorizationReceipt & {
        baselineSnapshot: unknown
      }
    expect(
      activatePerformanceAcceptanceMatrix({
        candidate,
        authorizationPort: { resolve: () => legacy as PerformanceAcceptanceAuthorizationReceipt },
      }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_authorization_binding_mismatch"],
    })
  })

  it("does not accept a caller baseline with changed metrics under the same version", () => {
    const changedBaseline = {
      ...baseline,
      flows: baseline.flows.map((flow) => ({ ...flow, latencyP95Ms: 1_000 })),
    }
    expect(
      buildPerformanceAcceptanceEvidence({
        selected: selected(),
        baseline: changedBaseline,
        samples: samples(),
      }),
    ).toEqual({
      status: "baseline_only",
      matrixId: candidate.matrixId,
      matrixVersion: candidate.matrixVersion,
      baselineVersion,
      authorizationId: receipt.authorizationId,
      reasonCodes: ["performance_baseline_snapshot_mismatch"],
    })
  })
})
