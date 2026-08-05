import { describe, expect, it } from "vitest"

import {
  type PerformanceAcceptanceAuthorizationPort,
  type PerformanceAcceptanceAuthorizationReceipt,
  type PerformanceAcceptanceMatrixCandidate,
  activatePerformanceAcceptanceMatrix,
  evaluateMeasuredFlowWithAcceptanceMatrix,
  validatePerformanceAcceptanceMatrix,
} from "../packages/core/src/maintenance/performance-acceptance-matrix.ts"
import {
  REQUIRED_REPRESENTATIVE_FLOW_IDS,
  auditRepresentativeFlowBaseline,
  buildMeasuredRepresentativeFlowSample,
} from "../packages/core/src/maintenance/performance-baseline.ts"

const thresholds = {
  maxLatencyRegressionRatio: 2,
  maxLlmCallIncrease: 1,
  maxAttemptIncrease: 1,
}
const candidate: PerformanceAcceptanceMatrixCandidate = {
  schemaVersion: 1,
  matrixId: "performance-matrix:fixture",
  matrixVersion: 1,
  baselineVersion: "baseline:fixture:v1",
  baselineSnapshot: {
    schemaVersion: 1,
    baselineVersion: "baseline:fixture:v1",
    flows: REQUIRED_REPRESENTATIVE_FLOW_IDS.map((flowId) => ({
      flowId,
      latencyP95Ms: 100,
      llmCallCount: 1,
      attemptCount: 1,
    })),
  },
  thresholds: {
    direct_answer: thresholds,
    current_fact_read: thresholds,
    tool_write: thresholds,
    child_delegation: thresholds,
    cancel: thresholds,
  },
}
const approval: PerformanceAcceptanceAuthorizationReceipt = {
  schemaVersion: 1,
  authorizationId: "authorization:fixture",
  decision: "approved",
  actorType: "administrator",
  actorId: "admin:fixture",
  scope: "performance_release_gate",
  matrixId: candidate.matrixId,
  matrixVersion: candidate.matrixVersion,
  baselineVersion: candidate.baselineVersion,
  thresholdSnapshot: candidate.thresholds,
  baselineSnapshot: candidate.baselineSnapshot,
  approvedAt: 1_000,
}

function authorizationPort(
  receipt: PerformanceAcceptanceAuthorizationReceipt | undefined,
): PerformanceAcceptanceAuthorizationPort {
  return { resolve: () => receipt }
}

const reference = auditRepresentativeFlowBaseline({
  fixtureVersion: candidate.baselineVersion,
  sourceKind: "deterministic_fixture",
  samples: [
    ["direct_answer", 100, 1, 1],
    ["current_fact_read", 100, 1, 1],
    ["tool_write", 100, 1, 1],
    ["child_delegation", 100, 1, 1],
    ["cancel", 100, 1, 1],
  ].map(([flowId, durationMs, llmCallCount, attemptCount], index) => ({
    flowId,
    sampleId: `fixture:${index}`,
    durationMs,
    llmCallCount,
    inputTokens: 1,
    outputTokens: 1,
    costEstimateUsd: 0,
    attemptCount,
    queueWaitMs: 0,
    eventBytes: 1,
    evidenceBytes: 1,
  })) as never,
}).flows.find((flow) => flow.flowId === "current_fact_read")
if (!reference) throw new Error("current_fact_read reference is required")

const live = buildMeasuredRepresentativeFlowSample({
  flowId: "current_fact_read",
  sampleId: "run:fixture",
  startedAt: 100,
  finishedAt: 250,
  llmReceipts: [
    {
      invocationId: "invocation:fixture",
      phase: "completed",
      at: 240,
      durationMs: 100,
      inputTokens: 10,
      outputTokens: 5,
      context: { stage: "execution" },
    },
  ],
  costEstimateUsd: null,
  attemptCount: 1,
  queueWaitMs: 0,
  eventBytes: 1,
  evidenceBytes: 1,
})

describe("task125 performance acceptance matrix", () => {
  it("requires every representative flow and finite non-negative thresholds", () => {
    const missing = {
      ...candidate,
      thresholds: {
        direct_answer: thresholds,
        current_fact_read: thresholds,
        tool_write: thresholds,
        child_delegation: thresholds,
      },
    }
    expect(validatePerformanceAcceptanceMatrix(missing)).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_required_flow_missing:cancel"],
    })
    expect(
      validatePerformanceAcceptanceMatrix({
        ...candidate,
        thresholds: {
          ...candidate.thresholds,
          current_fact_read: { ...thresholds, maxLlmCallIncrease: -1 },
        },
      }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_threshold_invalid:current_fact_read:maxLlmCallIncrease"],
    })
    expect(
      validatePerformanceAcceptanceMatrix({
        ...candidate,
        thresholds: {
          ...candidate.thresholds,
          current_fact_read: { ...thresholds, maxAttemptIncrease: 0.5 },
        },
      }),
    ).toEqual({
      status: "baseline_only",
      reasonCodes: ["matrix_threshold_invalid:current_fact_read:maxAttemptIncrease"],
    })
  })

  it("does not activate without an exact administrator authorization receipt", () => {
    expect(
      activatePerformanceAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort(undefined),
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["matrix_authorization_missing"] })
    expect(
      activatePerformanceAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort({ ...approval, matrixVersion: 2 }),
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["matrix_authorization_binding_mismatch"] })
    expect(
      activatePerformanceAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort({ ...approval, actorType: "system" }),
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["matrix_authorization_actor_invalid"] })
  })

  it("activates an approved fixture without defining a product threshold", () => {
    expect(
      activatePerformanceAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort(approval),
      }),
    ).toMatchObject({
      status: "active",
      matrix: {
        candidate: { matrixId: candidate.matrixId },
        authorization: { authorizationId: approval.authorizationId },
      },
    })
  })

  it("evaluates only a live sample bound to the approved baseline and flow", () => {
    expect(
      evaluateMeasuredFlowWithAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort(approval),
        referenceBaselineVersion: candidate.baselineVersion,
        reference,
        live,
      }),
    ).toMatchObject({ status: "accepted", reasonCodes: [] })
    expect(
      evaluateMeasuredFlowWithAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort(approval),
        referenceBaselineVersion: "baseline:other",
        reference,
        live,
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["matrix_baseline_binding_mismatch"] })

    const incomplete = buildMeasuredRepresentativeFlowSample({
      flowId: "current_fact_read",
      sampleId: "run:incomplete",
      startedAt: 100,
      finishedAt: 250,
      llmReceipts: [
        {
          invocationId: "invocation:incomplete",
          phase: "completed",
          at: 240,
          context: { stage: "execution" },
        },
      ],
      costEstimateUsd: null,
      attemptCount: 1,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    })
    expect(
      evaluateMeasuredFlowWithAcceptanceMatrix({
        candidate,
        authorizationPort: authorizationPort(approval),
        referenceBaselineVersion: candidate.baselineVersion,
        reference,
        live: incomplete,
      }),
    ).toEqual({ status: "baseline_only", reasonCodes: ["live_measurement_incomplete"] })
  })
})
