import { describe, expect, it } from "vitest"
import {
  auditRepresentativeFlowBaseline,
  buildMeasuredRepresentativeFlowSample,
  compareMeasuredFlowToBaseline,
} from "../packages/core/src/maintenance/performance-baseline.ts"

const live = buildMeasuredRepresentativeFlowSample({
  flowId: "current_fact_read",
  sampleId: "run:25dda41d-0122-46db-9e84-71f1044e87d6",
  startedAt: 1_784_244_002_091,
  finishedAt: 1_784_244_234_699,
  llmReceipts: [
    { invocationId: "intake-1", phase: "started", at: 1, context: { stage: "intake" } },
    {
      invocationId: "intake-1",
      phase: "completed",
      at: 20_001,
      durationMs: 20_000,
      inputTokens: 800,
      outputTokens: 200,
      context: { stage: "intake" },
    },
    {
      invocationId: "execute-1",
      phase: "completed",
      at: 80_001,
      durationMs: 60_000,
      inputTokens: 4_000,
      outputTokens: 400,
      context: { stage: "execution" },
    },
    {
      invocationId: "review-1",
      phase: "completed",
      at: 110_001,
      durationMs: 30_000,
      inputTokens: 5_000,
      outputTokens: 300,
      context: { stage: "review" },
    },
    {
      invocationId: "execute-2",
      phase: "completed",
      at: 170_001,
      durationMs: 60_000,
      inputTokens: 6_000,
      outputTokens: 500,
      context: { stage: "execution" },
    },
    {
      invocationId: "review-2",
      phase: "completed",
      at: 200_001,
      durationMs: 30_000,
      inputTokens: 7_000,
      outputTokens: 350,
      context: { stage: "review" },
    },
    {
      invocationId: "final-1",
      phase: "completed",
      at: 230_001,
      durationMs: 30_000,
      inputTokens: 8_000,
      outputTokens: 250,
      context: { stage: "final_response" },
    },
  ],
  costEstimateUsd: null,
  attemptCount: 3,
  queueWaitMs: 0,
  eventBytes: 12_000,
  evidenceBytes: 20_000,
})

const baseline = auditRepresentativeFlowBaseline({
  fixtureVersion: "phase0:representative-flows:v1",
  sourceKind: "deterministic_fixture",
  samples: [
    {
      flowId: "direct_answer",
      sampleId: "0",
      durationMs: 820,
      llmCallCount: 1,
      inputTokens: 1,
      outputTokens: 1,
      costEstimateUsd: 0.001,
      attemptCount: 1,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    },
    {
      flowId: "current_fact_read",
      sampleId: "1",
      durationMs: 1_940,
      llmCallCount: 2,
      inputTokens: 1,
      outputTokens: 1,
      costEstimateUsd: 0.001,
      attemptCount: 2,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    },
    {
      flowId: "tool_write",
      sampleId: "2",
      durationMs: 2_480,
      llmCallCount: 2,
      inputTokens: 1,
      outputTokens: 1,
      costEstimateUsd: 0.001,
      attemptCount: 2,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    },
    {
      flowId: "child_delegation",
      sampleId: "3",
      durationMs: 3_600,
      llmCallCount: 3,
      inputTokens: 1,
      outputTokens: 1,
      costEstimateUsd: 0.001,
      attemptCount: 3,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    },
    {
      flowId: "cancel",
      sampleId: "4",
      durationMs: 540,
      llmCallCount: 1,
      inputTokens: 1,
      outputTokens: 1,
      costEstimateUsd: 0.001,
      attemptCount: 1,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    },
  ],
})
const reference = baseline.flows.find((flow) => flow.flowId === "current_fact_read")
if (!reference) throw new Error("current_fact_read reference baseline is required")

describe("task123 measured performance baseline", () => {
  it("projects one live run from terminal typed LLM receipts without inventing cost", () => {
    expect(live).toMatchObject({
      sourceKind: "live_runtime",
      durationMs: 232_608,
      llmCallCount: 6,
      inputTokens: 30_800,
      outputTokens: 2_000,
      costEstimateUsd: null,
      attemptCount: 3,
    })
    expect(live.stages).toEqual([
      { stage: "intake", llmCallCount: 1, durationMs: 20_000, inputTokens: 800, outputTokens: 200 },
      {
        stage: "execution",
        llmCallCount: 2,
        durationMs: 120_000,
        inputTokens: 10_000,
        outputTokens: 900,
      },
      {
        stage: "review",
        llmCallCount: 2,
        durationMs: 60_000,
        inputTokens: 12_000,
        outputTokens: 650,
      },
      {
        stage: "final_response",
        llmCallCount: 1,
        durationMs: 30_000,
        inputTokens: 8_000,
        outputTokens: 250,
      },
    ])
  })

  it("reports deltas without making an acceptance decision when thresholds are absent", () => {
    expect(compareMeasuredFlowToBaseline({ reference, live })).toEqual({
      status: "baseline_only",
      latencyRegressionRatio: 119.901031,
      llmCallIncrease: 4,
      attemptIncrease: 1,
      reasonCodes: ["acceptance_thresholds_not_approved"],
    })
  })

  it("evaluates only explicitly supplied acceptance thresholds", () => {
    expect(
      compareMeasuredFlowToBaseline({
        reference,
        live,
        thresholds: {
          maxLatencyRegressionRatio: 2,
          maxLlmCallIncrease: 1,
          maxAttemptIncrease: 0,
        },
      }),
    ).toMatchObject({
      status: "rejected",
      reasonCodes: [
        "latency_regression_exceeded",
        "llm_call_increase_exceeded",
        "attempt_increase_exceeded",
      ],
    })

    expect(
      compareMeasuredFlowToBaseline({
        reference,
        live,
        thresholds: {
          maxLatencyRegressionRatio: 120,
          maxLlmCallIncrease: 4,
          maxAttemptIncrease: 1,
        },
      }),
    ).toMatchObject({ status: "accepted", reasonCodes: [] })
  })

  it("keeps incomplete or contradictory measurements out of acceptance", () => {
    const incomplete = buildMeasuredRepresentativeFlowSample({
      flowId: "current_fact_read",
      sampleId: "run:incomplete",
      startedAt: 100,
      finishedAt: 200,
      llmReceipts: [
        {
          invocationId: "duplicate",
          phase: "completed",
          at: 150,
          durationMs: 50,
          context: { stage: "execution" },
        },
        {
          invocationId: "duplicate",
          phase: "failed",
          at: 160,
          durationMs: 60,
          context: { stage: "execution" },
        },
      ],
      costEstimateUsd: null,
      attemptCount: -1,
      queueWaitMs: 0,
      eventBytes: 1,
      evidenceBytes: 1,
    })

    expect(incomplete).toMatchObject({
      complete: false,
      inputTokens: null,
      outputTokens: null,
      diagnostics: ["llm_terminal_duplicate", "measurement_invalid:attemptCount"],
    })
    expect(
      compareMeasuredFlowToBaseline({
        reference,
        live: incomplete,
        thresholds: {
          maxLatencyRegressionRatio: 1_000,
          maxLlmCallIncrease: 1_000,
          maxAttemptIncrease: 1_000,
        },
      }),
    ).toMatchObject({
      status: "baseline_only",
      reasonCodes: ["live_measurement_incomplete"],
    })
  })
})
