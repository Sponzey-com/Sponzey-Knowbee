import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  getDb,
  insertAuditLog,
  insertMessageLedgerEvent,
  insertSession,
} from "../packages/core/src/db/index.js"
import { SqliteTypedObservabilityEventRepository } from "../packages/core/src/db/typed-observability-event-repository.js"
import { collectReleaseWindowMetricReport } from "../packages/core/src/release/release-window-metrics-use-case.js"
import {
  type ReleaseMetricBaseline,
  type ReleaseMetricSourceSnapshot,
  buildReleaseWindowMetricReport,
  projectReleaseMetricFieldDebugLog,
  projectReleaseMetricProductLog,
} from "../packages/core/src/release/release-window-metrics.js"
import { SqliteReleaseMetricRecordPort } from "../packages/core/src/release/sqlite-release-metric-record-port.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { type TestDbRuntimeFixture, createTestDbRuntimeFixture } from "./fixtures/runtime-db.js"

const REQUIRED_STAGES = [
  "request_total",
  "analysis",
  "execution",
  "review",
  "canonical_delivery",
  "terminal_projection",
] as const

function sourceSnapshot(): ReleaseMetricSourceSnapshot {
  return {
    samples: [
      {
        sampleId: "run-1:request_total",
        runId: "run-1",
        stage: "request_total",
        durationMs: 100,
        observedAt: 1_100,
      },
      {
        sampleId: "run-1:request_total",
        runId: "run-1",
        stage: "request_total",
        durationMs: 100,
        observedAt: 1_100,
      },
      {
        sampleId: "run-2:request_total",
        runId: "run-2",
        stage: "request_total",
        durationMs: 300,
        observedAt: 1_300,
      },
      {
        sampleId: "run-1:analysis",
        runId: "run-1",
        stage: "analysis",
        durationMs: 40,
        observedAt: 1_040,
      },
      {
        sampleId: "run-2:analysis",
        runId: "run-2",
        stage: "analysis",
        durationMs: 80,
        observedAt: 1_080,
      },
      {
        sampleId: "run-1:execution",
        runId: "run-1",
        stage: "execution",
        durationMs: 30,
        observedAt: 1_070,
      },
      {
        sampleId: "run-1:review",
        runId: "run-1",
        stage: "review",
        durationMs: 20,
        observedAt: 1_090,
      },
      {
        sampleId: "run-1:terminal_projection",
        runId: "run-1",
        stage: "terminal_projection",
        durationMs: 10,
        observedAt: 1_100,
      },
    ],
    counters: [
      {
        receiptId: "run-1:llm:1",
        runId: "run-1",
        counter: "llm_invocation",
        amount: 1,
        observedAt: 1_020,
      },
      {
        receiptId: "run-1:llm:1",
        runId: "run-1",
        counter: "llm_invocation",
        amount: 1,
        observedAt: 1_020,
      },
      {
        receiptId: "run-1:recovery:1",
        runId: "run-1",
        counter: "recovery",
        amount: 1,
        observedAt: 1_060,
      },
      {
        receiptId: "run-1:delivery-failure:1",
        runId: "run-1",
        counter: "delivery_failure",
        amount: 1,
        observedAt: 1_095,
      },
    ],
    measuredCounters: ["llm_invocation", "recovery", "delivery_failure"],
    runCount: 2,
    terminalRunCount: 1,
    issues: [],
  }
}

describe("Task 115 release-window metric domain", () => {
  it("keeps domain and application metric boundaries free of infrastructure access", () => {
    for (const file of [
      "packages/core/src/release/release-window-metrics.ts",
      "packages/core/src/release/release-window-metrics-use-case.ts",
    ]) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
      expect(source).not.toMatch(/(?:\.\.\/db\/|node:|process\.|Date\.now|fetch\(|getDb\()/u)
    }
  })

  it("deduplicates replayed receipts and never treats an unobserved required stage as zero", () => {
    const report = buildReleaseWindowMetricReport({
      window: { windowId: "release-115", startAt: 1_000, endAt: 2_000 },
      source: sourceSnapshot(),
      requiredStages: REQUIRED_STAGES,
      configuredStages: REQUIRED_STAGES,
      baseline: null,
    })

    expect(report.metrics.find((metric) => metric.stage === "request_total")).toMatchObject({
      observation: "measured",
      count: 2,
      p50Ms: 100,
      p95Ms: 300,
      maxMs: 300,
    })
    expect(report.metrics.find((metric) => metric.stage === "canonical_delivery")).toEqual(
      expect.objectContaining({
        observation: "not_observed",
        count: 0,
        p50Ms: null,
        p95Ms: null,
        maxMs: null,
      }),
    )
    expect(report.counters.find((counter) => counter.counter === "llm_invocation")).toMatchObject({
      observation: "measured",
      count: 1,
    })
    expect(report.counters.find((counter) => counter.counter === "tool_invocation")).toMatchObject({
      observation: "not_configured",
      count: null,
    })
    expect(report.counters.find((counter) => counter.counter === "recovery")).toMatchObject({
      observation: "measured",
      count: 1,
    })
    expect(report.admission).toMatchObject({
      status: "rejected",
      state: "coverage_evaluated",
    })
    expect(report.admission.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "metric_coverage",
          code: "required_metric_not_observed",
          stage: "canonical_delivery",
        }),
      ]),
    )
  })

  it("separates authorization blockers from product regressions and requires an approved baseline", () => {
    const source = sourceSnapshot()
    const coverageBlocked = buildReleaseWindowMetricReport({
      window: { windowId: "release-authorization", startAt: 1_000, endAt: 2_000 },
      source,
      requiredStages: ["request_total", "approval_wait"],
      configuredStages: ["request_total", "approval_wait"],
      authorizationRequiredStages: ["approval_wait"],
      baseline: null,
    })

    expect(
      coverageBlocked.metrics.find((metric) => metric.stage === "approval_wait")?.observation,
    ).toBe("authorization_required")
    expect(coverageBlocked.admission).toMatchObject({
      status: "blocked_external_input",
      state: "coverage_evaluated",
    })
    expect(coverageBlocked.admission.blockers).toEqual([
      expect.objectContaining({ category: "external_input", code: "authorization_required" }),
    ])

    const notConfigured = buildReleaseWindowMetricReport({
      window: { windowId: "release-not-configured", startAt: 1_000, endAt: 2_000 },
      source,
      requiredStages: ["queue_wait"],
      configuredStages: [],
      baseline: null,
    })
    expect(notConfigured.metrics.find((metric) => metric.stage === "queue_wait")?.observation).toBe(
      "not_configured",
    )
    expect(notConfigured.admission.blockers).toEqual([
      expect.objectContaining({
        category: "metric_coverage",
        code: "required_metric_not_configured",
      }),
    ])

    const baselineRequired = buildReleaseWindowMetricReport({
      window: { windowId: "release-baseline", startAt: 1_000, endAt: 2_000 },
      source,
      requiredStages: ["request_total"],
      configuredStages: ["request_total"],
      baseline: null,
    })
    expect(baselineRequired.admission).toMatchObject({
      status: "rejected",
      state: "baseline_evaluated",
      blockers: [
        expect.objectContaining({
          category: "baseline_required",
          code: "approved_baseline_missing",
        }),
      ],
    })

    const baseline: ReleaseMetricBaseline = {
      baselineId: "approved-baseline-1",
      approvedAt: 900,
      stageLimits: { request_total: { p95MaxMs: 200, maxMs: 250 } },
    }
    const regression = buildReleaseWindowMetricReport({
      window: { windowId: "release-regression", startAt: 1_000, endAt: 2_000 },
      source,
      requiredStages: ["request_total"],
      configuredStages: ["request_total"],
      baseline,
    })
    expect(regression.admission).toMatchObject({
      status: "rejected",
      state: "rejected",
    })
    expect(regression.admission.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "product_regression", code: "p95_limit_exceeded" }),
        expect.objectContaining({ category: "product_regression", code: "max_limit_exceeded" }),
      ]),
    )
  })

  it("keeps product and field-debug projections structured and free of source records", () => {
    const report = buildReleaseWindowMetricReport({
      window: { windowId: "release-redaction", startAt: 1_000, endAt: 2_000 },
      source: sourceSnapshot(),
      requiredStages: ["request_total"],
      configuredStages: ["request_total"],
      baseline: {
        baselineId: "approved-baseline-safe",
        approvedAt: 900,
        stageLimits: { request_total: { p95MaxMs: 500 } },
      },
    })

    const product = projectReleaseMetricProductLog(report)
    const fieldDebug = projectReleaseMetricFieldDebugLog(report)
    expect(product).toEqual({
      windowId: "release-redaction",
      sampleCount: 7,
      runCount: 2,
      admissionStatus: "admitted",
      blockerCategoryCounts: {},
    })
    expect(fieldDebug.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "request_total",
          count: 2,
          p50Ms: 100,
          p95Ms: 300,
          maxMs: 300,
        }),
      ]),
    )
    expect(JSON.stringify({ product, fieldDebug })).not.toMatch(
      /run-1|receiptId|sampleId|prompt|answer|url/i,
    )
  })
})

describe("Task 115 persisted release-window metric adapter", () => {
  let runtime: TestDbRuntimeFixture

  beforeEach(() => {
    runtime = createTestDbRuntimeFixture("knowbee-task115-release-metric-")
    insertSession({
      id: "session:task115",
      source: "telegram",
      source_id: "chat:task115",
      created_at: 1_000,
      updated_at: 1_500,
      summary: "safe session",
    })
    createRootRun({
      id: "run:task115",
      sessionId: "session:task115",
      requestGroupId: "group:task115",
      prompt: "SECRET_PROMPT https://private.example.test/raw",
      source: "telegram",
    })
    getDb()
      .prepare(
        "UPDATE root_runs SET created_at = ?, updated_at = ?, status = ?, current_step_key = ? WHERE id = ?",
      )
      .run(1_000, 1_500, "completed", "completed", "run:task115")
    getDb()
      .prepare(
        "UPDATE run_steps SET status = ?, started_at = ?, finished_at = ? WHERE run_id = ? AND step_key = ?",
      )
      .run("completed", 1_100, 1_300, "run:task115", "executing")
    getDb()
      .prepare(
        "UPDATE run_steps SET status = ?, started_at = ?, finished_at = ? WHERE run_id = ? AND step_key = ?",
      )
      .run("completed", 1_300, 1_400, "run:task115", "reviewing")
    getDb()
      .prepare(
        "UPDATE run_steps SET status = ?, started_at = ?, finished_at = ? WHERE run_id = ? AND step_key = ?",
      )
      .run("completed", 1_400, 1_490, "run:task115", "finalizing")

    const repository = new SqliteTypedObservabilityEventRepository()
    const correlation = {
      requestId: "run:task115",
      requestGroupId: "group:task115",
      rootRunId: "run:task115",
      runId: "run:task115",
      workId: "work:task115",
    }
    repository.append({
      eventId: "task115:execution",
      kind: "execution_started",
      purpose: "field_debug",
      at: 1_100,
      correlation: { ...correlation, attemptId: "attempt:task115" },
      reasonCode: "execution_started",
      summary: "Execution started",
    })
    repository.append({
      eventId: "task115:evidence",
      kind: "evidence_recorded",
      purpose: "field_debug",
      at: 1_300,
      correlation: { ...correlation, attemptId: "attempt:task115", evidenceId: "evidence:task115" },
      reasonCode: "evidence_recorded",
      summary: "Evidence recorded",
    })
    repository.append({
      eventId: "task115:review",
      kind: "review_completed",
      purpose: "product",
      at: 1_400,
      correlation: { ...correlation, reviewId: "review:task115", evidenceId: "evidence:task115" },
      reasonCode: "all_criteria_verified",
      summary: "Review completed",
    })
    repository.append({
      eventId: "task115:finalization",
      kind: "finalization_completed",
      purpose: "product",
      at: 1_490,
      correlation: { ...correlation, reviewId: "review:task115" },
      reasonCode: "report_delivered",
      summary: "Delivery completed",
    })
    insertAuditLog({
      timestamp: 1_200,
      session_id: "session:task115",
      run_id: "run:task115",
      request_group_id: "group:task115",
      channel: "telegram",
      source: "tool_dispatcher",
      tool_name: "web_fetch",
      params: "SECRET_PARAMS https://private.example.test/raw",
      output: "SECRET_ANSWER",
      result: "success",
      duration_ms: 50,
      approval_required: 0,
      approved_by: null,
    })
    insertMessageLedgerEvent({
      id: "ledger:task115:delivered",
      runId: "run:task115",
      requestGroupId: "group:task115",
      channel: "telegram",
      eventKind: "final_answer_delivered",
      status: "delivered",
      summary: "SECRET_ANSWER",
      detail: { rawResponse: "SECRET_ANSWER", url: "https://private.example.test/raw" },
      createdAt: 1_490,
    })
  })

  afterEach(() => runtime.dispose())

  it("rebuilds the same redacted metric report from persisted receipts after adapter recreation", () => {
    const baseline: ReleaseMetricBaseline = {
      baselineId: "approved-task115",
      approvedAt: 900,
      stageLimits: {
        request_total: { p95MaxMs: 1_000 },
        execution: { p95MaxMs: 500 },
        review: { p95MaxMs: 500 },
        canonical_delivery: { p95MaxMs: 500 },
        terminal_projection: { p95MaxMs: 500 },
      },
    }
    const input = {
      window: { windowId: "persisted-task115", startAt: 900, endAt: 1_600 },
      requiredStages: [
        "request_total",
        "execution",
        "review",
        "canonical_delivery",
        "terminal_projection",
      ] as const,
      configuredStages: [
        "request_total",
        "execution",
        "review",
        "canonical_delivery",
        "terminal_projection",
      ] as const,
      baseline,
    }
    const first = collectReleaseWindowMetricReport({
      ...input,
      recordPort: new SqliteReleaseMetricRecordPort(),
    })
    const replayed = collectReleaseWindowMetricReport({
      ...input,
      recordPort: new SqliteReleaseMetricRecordPort(),
    })

    expect(replayed).toEqual(first)
    expect(first.admission.status).toBe("admitted")
    expect(first.counters.find((counter) => counter.counter === "llm_invocation")).toMatchObject({
      observation: "not_configured",
      count: null,
    })
    expect(first.counters.find((counter) => counter.counter === "tool_invocation")).toMatchObject({
      observation: "measured",
      count: 1,
    })
    expect(first.counters.find((counter) => counter.counter === "delivery_failure")).toMatchObject({
      observation: "measured",
      count: 0,
    })
    expect(first.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "request_total", count: 1, p95Ms: 500 }),
        expect.objectContaining({ stage: "execution", count: 1, p95Ms: 200 }),
        expect.objectContaining({ stage: "review", count: 1, p95Ms: 100 }),
        expect.objectContaining({ stage: "canonical_delivery", count: 1, p95Ms: 90 }),
      ]),
    )
    expect(JSON.stringify(first)).not.toMatch(/SECRET_|private\.example|web_fetch|telegram/i)
  })

  it("counts completed, failed, and cancelled terminal receipts without reading their text", () => {
    for (const [runId, status, createdAt, updatedAt] of [
      ["run:task115:failed", "failed", 1_010, 1_200],
      ["run:task115:cancelled", "cancelled", 1_020, 1_250],
    ] as const) {
      createRootRun({
        id: runId,
        sessionId: "session:task115",
        requestGroupId: `group:${runId}`,
        prompt: `SECRET_${status.toUpperCase()}_PROMPT`,
        source: "telegram",
      })
      getDb()
        .prepare("UPDATE root_runs SET created_at = ?, updated_at = ?, status = ? WHERE id = ?")
        .run(createdAt, updatedAt, status, runId)
    }

    const report = collectReleaseWindowMetricReport({
      window: { windowId: "terminal-task115", startAt: 900, endAt: 1_600 },
      requiredStages: ["request_total"],
      configuredStages: ["request_total"],
      baseline: {
        baselineId: "terminal-baseline",
        approvedAt: 800,
        stageLimits: { request_total: { p95MaxMs: 1_000 } },
      },
      recordPort: new SqliteReleaseMetricRecordPort(),
    })

    expect(report.sourceRunCount).toBe(3)
    expect(report.terminalRunCount).toBe(3)
    expect(report.metrics.find((metric) => metric.stage === "request_total")?.count).toBe(3)
    expect(JSON.stringify(report)).not.toMatch(/SECRET_|failed_prompt|cancelled_prompt/i)
  })

  it("separates duplicate suppression from delivery failure counters", () => {
    insertMessageLedgerEvent({
      id: "ledger:task115:duplicate",
      runId: "run:task115",
      requestGroupId: "group:task115",
      channel: "telegram",
      eventKind: "final_answer_duplicate",
      status: "suppressed",
      summary: "SECRET_DUPLICATE",
      createdAt: 1_495,
    })
    insertMessageLedgerEvent({
      id: "ledger:task115:failure",
      runId: "run:task115",
      requestGroupId: "group:task115",
      channel: "telegram",
      eventKind: "final_answer_delivery",
      status: "failed",
      summary: "SECRET_FAILURE",
      createdAt: 1_496,
    })

    const report = collectReleaseWindowMetricReport({
      window: { windowId: "delivery-task115", startAt: 900, endAt: 1_600 },
      requiredStages: ["request_total"],
      configuredStages: ["request_total"],
      baseline: {
        baselineId: "delivery-baseline",
        approvedAt: 800,
        stageLimits: { request_total: { p95MaxMs: 1_000 } },
      },
      recordPort: new SqliteReleaseMetricRecordPort(),
    })

    expect(report.counters.find((counter) => counter.counter === "delivery_duplicate")?.count).toBe(
      1,
    )
    expect(report.counters.find((counter) => counter.counter === "delivery_failure")?.count).toBe(1)
    expect(JSON.stringify(report)).not.toMatch(/SECRET_|telegram/i)
  })
})
