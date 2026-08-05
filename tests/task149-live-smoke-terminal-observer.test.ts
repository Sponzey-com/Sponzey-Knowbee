import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { observeLiveSmokeTerminal } from "../packages/core/src/channels/live-smoke-terminal-observer.ts"
import type { TypedObservabilityEvent } from "../packages/core/src/observability/typed-event-contract.ts"
import type { RootRun } from "../packages/core/src/runs/types.ts"

const STARTED = { requestId: "run-149", runId: "run-149", requestGroupId: "run-149" }

function run(): RootRun {
  return {
    id: "run-149",
    sessionId: "session-149",
    requestGroupId: "run-149",
    lineageRootRunId: "run-149",
    runScope: "root",
    title: "Smoke",
    prompt: "status",
    source: "webui",
    status: "completed",
    taskProfile: "general_chat",
    contextMode: "full",
    delegationTurnCount: 0,
    maxDelegationTurns: 3,
    currentStepKey: "completed",
    currentStepIndex: 8,
    totalSteps: 9,
    summary: "Completed",
    canCancel: false,
    createdAt: 1,
    updatedAt: 9,
    steps: [],
    recentEvents: [],
  }
}

function events(): TypedObservabilityEvent[] {
  const correlation = {
    requestId: "run-149",
    requestGroupId: "run-149",
    rootRunId: "run-149",
    runId: "run-149",
    workId: "work-149",
  }
  return [
    {
      eventId: "analysis-149",
      kind: "analysis_completed",
      purpose: "product",
      at: 1,
      correlation,
      reasonCode: "diagnosis_accepted",
      summary: "Solution analysis completed",
    },
    {
      eventId: "evidence-149",
      kind: "evidence_recorded",
      purpose: "field_debug",
      at: 2,
      correlation: { ...correlation, attemptId: "attempt-149", evidenceId: "evidence-149" },
      reasonCode: "attempt_evidence_recorded",
      summary: "Execution evidence recorded",
    },
    {
      eventId: "review-149",
      kind: "review_completed",
      purpose: "product",
      at: 3,
      correlation: { ...correlation, evidenceId: "evidence-149", reviewId: "review-149" },
      reasonCode: "paths_exhausted",
      summary: "Canonical result review completed",
    },
    {
      eventId: "finalization-149",
      kind: "finalization_completed",
      purpose: "product",
      at: 4,
      correlation: { ...correlation, reviewId: "review-149" },
      reasonCode: "report_delivered",
      summary: "User report delivery completed",
    },
  ]
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    started: STARTED,
    completion: Promise.resolve(run()),
    observabilityRepository: { list: () => ({ events: events(), issues: [] }) },
    listTopologyRunsForRootRun: () => [{ id: "topology-149" }],
    readExecutionOutcome: () => ({
      executionStatus: "succeeded" as const,
      deliveryStatus: "delivered" as const,
    }),
    readFirstResponseLatency: () => ({
      metricId: "latency-149",
      runId: "run-149",
      requestGroupId: "run-149",
      durationMs: 300,
      budgetMs: 30_000,
      status: "ok" as const,
    }),
    startedAt: 1_000,
    now: () => 1_900,
    timeoutMs: 100,
    completionRejection: "interrupted" as const,
    ...overrides,
  }
}

describe("Task 149 shared live smoke terminal observer", () => {
  it("projects canonical terminal stages and review reasons", async () => {
    await expect(observeLiveSmokeTerminal(input())).resolves.toMatchObject({
      run: { id: "run-149" },
      projection: {
        ...STARTED,
        terminalStatus: "completed",
        typedTraceStatus: "ready",
        typedTraceTerminal: true,
        typedTraceIssueCount: 0,
        analysisCompleted: true,
        evidenceRecorded: true,
        reviewCompleted: true,
        finalizationCompleted: true,
        topologyRunCount: 1,
        auditEventId: "finalization-149",
        resultReviewReasonCodes: ["paths_exhausted"],
        executionOutcome: {
          executionStatus: "succeeded",
          deliveryStatus: "delivered",
        },
        latencyEvidence: {
          metricId: "latency-149",
          runId: "run-149",
          requestGroupId: "run-149",
          durationMs: 300,
          budgetMs: 30_000,
          status: "ok",
          terminalResponseLatencyMs: 900,
          completedAt: 1_900,
        },
      },
    })
  })

  it("returns unavailable projections for missing completion, timeout, and abort", async () => {
    await expect(observeLiveSmokeTerminal(input({ completion: undefined }))).resolves.toMatchObject(
      {
        projection: { terminalStatus: "interrupted", typedTraceStatus: "unavailable" },
      },
    )
    await expect(
      observeLiveSmokeTerminal(input({ completion: new Promise(() => undefined), timeoutMs: 1 })),
    ).resolves.toMatchObject({
      projection: { terminalStatus: "timed_out", typedTraceStatus: "unavailable" },
    })
    const controller = new AbortController()
    controller.abort()
    await expect(
      observeLiveSmokeTerminal(input({ signal: controller.signal })),
    ).resolves.toMatchObject({
      projection: { terminalStatus: "interrupted", typedTraceStatus: "unavailable" },
    })
  })

  it("preserves channel-specific completion rejection behavior", async () => {
    const rejected = Promise.reject(new Error("completion failed"))
    await expect(
      observeLiveSmokeTerminal(input({ completion: rejected, completionRejection: "interrupted" })),
    ).resolves.toMatchObject({ projection: { terminalStatus: "interrupted" } })
    await expect(
      observeLiveSmokeTerminal(
        input({
          completion: Promise.reject(new Error("completion failed")),
          completionRejection: "throw",
        }),
      ),
    ).rejects.toThrow("completion failed")
  })

  it("preserves empty traces, trace issues, and missing finalization as typed projection facts", async () => {
    const empty = await observeLiveSmokeTerminal(
      input({ observabilityRepository: { list: () => ({ events: [], issues: [] }) } }),
    )
    expect(empty.projection).toMatchObject({
      typedTraceStatus: "not_recorded",
      typedTraceTerminal: false,
      typedTraceIssueCount: 0,
      finalizationCompleted: false,
      resultReviewReasonCodes: [],
    })

    const withoutFinalization = events().filter((event) => event.kind !== "finalization_completed")
    const malformedIssue = {
      eventId: "malformed-149",
      code: "invalid_typed_observability_event",
      message: "Malformed event rejected",
    }
    const incomplete = await observeLiveSmokeTerminal(
      input({
        observabilityRepository: {
          list: () => ({ events: withoutFinalization, issues: [malformedIssue] }),
        },
      }),
    )
    expect(incomplete.projection).toMatchObject({
      typedTraceStatus: "ready",
      typedTraceTerminal: false,
      typedTraceIssueCount: 1,
      reviewCompleted: true,
      finalizationCompleted: false,
      resultReviewReasonCodes: ["paths_exhausted"],
    })
    expect(incomplete.projection).not.toHaveProperty("auditEventId")
  })

  it("has no channel, DB, provider, environment, or final-text dependency", () => {
    const source = readFileSync(
      new URL("../packages/core/src/channels/live-smoke-terminal-observer.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(/process\.env|\.\/telegram|\.\/webui|db\/|finalText|provider SDK/u)
  })
})
