export type ReleaseMetricStage =
  | "request_total"
  | "analysis"
  | "execution"
  | "approval_wait"
  | "llm_execution"
  | "tool_execution"
  | "review"
  | "final_response"
  | "canonical_delivery"
  | "terminal_projection"
  | "queue_wait"

export type ReleaseMetricObservation =
  | "measured"
  | "not_observed"
  | "not_configured"
  | "authorization_required"

export type ReleaseMetricCounter =
  | "llm_invocation"
  | "tool_invocation"
  | "recovery"
  | "queue_retry"
  | "delivery_duplicate"
  | "delivery_failure"

export interface ReleaseMetricWindow {
  windowId: string
  startAt: number
  endAt: number
}

export interface ReleaseMetricSample {
  sampleId: string
  runId: string
  stage: ReleaseMetricStage
  durationMs: number
  observedAt: number
}

export interface ReleaseMetricCounterReceipt {
  receiptId: string
  runId: string
  counter: ReleaseMetricCounter
  amount: number
  observedAt: number
}

export interface ReleaseMetricSourceIssue {
  code: "source_record_invalid" | "stored_event_invalid" | "window_limit_reached"
  count: number
}

export interface ReleaseMetricSourceSnapshot {
  samples: readonly ReleaseMetricSample[]
  counters: readonly ReleaseMetricCounterReceipt[]
  measuredCounters: readonly ReleaseMetricCounter[]
  runCount: number
  terminalRunCount: number
  issues: readonly ReleaseMetricSourceIssue[]
}

export interface ReleaseMetricStageLimit {
  p95MaxMs: number
  maxMs?: number | undefined
}

export interface ReleaseMetricBaseline {
  baselineId: string
  approvedAt: number
  stageLimits: Partial<Record<ReleaseMetricStage, ReleaseMetricStageLimit>>
}

export interface ReleaseMetricAggregate {
  stage: ReleaseMetricStage
  required: boolean
  observation: ReleaseMetricObservation
  count: number
  p50Ms: number | null
  p95Ms: number | null
  maxMs: number | null
}

export interface ReleaseMetricCounterAggregate {
  counter: ReleaseMetricCounter
  observation: ReleaseMetricObservation
  count: number | null
}

export type ReleaseMetricBlockerCategory =
  | "metric_coverage"
  | "baseline_required"
  | "product_regression"
  | "external_input"

export interface ReleaseMetricBlocker {
  category: ReleaseMetricBlockerCategory
  code:
    | "required_metric_not_observed"
    | "required_metric_not_configured"
    | "required_counter_not_observed"
    | "required_counter_not_configured"
    | "authorization_required"
    | "approved_baseline_missing"
    | "stage_baseline_missing"
    | "p95_limit_exceeded"
    | "max_limit_exceeded"
  stage?: ReleaseMetricStage | undefined
  counter?: ReleaseMetricCounter | undefined
}

export type ReleaseMetricAdmissionState =
  | "collecting"
  | "coverage_evaluated"
  | "baseline_evaluated"
  | "admitted"
  | "rejected"
  | "blocked_external_input"

export interface ReleaseMetricAdmission {
  status: "admitted" | "rejected" | "blocked_external_input"
  state: ReleaseMetricAdmissionState
  blockers: readonly ReleaseMetricBlocker[]
}

export interface ReleaseMetricReport {
  kind: "knowbee.release.window_metrics"
  window: ReleaseMetricWindow
  sourceRunCount: number
  terminalRunCount: number
  sampleCount: number
  sourceIssues: readonly ReleaseMetricSourceIssue[]
  metrics: readonly ReleaseMetricAggregate[]
  counters: readonly ReleaseMetricCounterAggregate[]
  baselineId: string | null
  admission: ReleaseMetricAdmission
}

const ALL_STAGES: readonly ReleaseMetricStage[] = [
  "request_total",
  "analysis",
  "execution",
  "approval_wait",
  "llm_execution",
  "tool_execution",
  "review",
  "final_response",
  "canonical_delivery",
  "terminal_projection",
  "queue_wait",
]

const ALL_COUNTERS: readonly ReleaseMetricCounter[] = [
  "llm_invocation",
  "tool_invocation",
  "recovery",
  "queue_retry",
  "delivery_duplicate",
  "delivery_failure",
]

function nearestRank(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)
  return sorted[index] ?? null
}

function dedupeSamples(
  samples: readonly ReleaseMetricSample[],
  window: ReleaseMetricWindow,
): ReleaseMetricSample[] {
  const deduped = new Map<string, ReleaseMetricSample>()
  for (const sample of samples) {
    if (sample.observedAt < window.startAt || sample.observedAt > window.endAt) continue
    if (!Number.isFinite(sample.durationMs) || sample.durationMs < 0) continue
    const stageReceiptKey = `${sample.runId}:${sample.stage}`
    if (!deduped.has(stageReceiptKey)) deduped.set(stageReceiptKey, sample)
  }
  return [...deduped.values()]
}

function dedupeCounters(
  counters: readonly ReleaseMetricCounterReceipt[],
  window: ReleaseMetricWindow,
): ReleaseMetricCounterReceipt[] {
  const deduped = new Map<string, ReleaseMetricCounterReceipt>()
  for (const receipt of counters) {
    if (receipt.observedAt < window.startAt || receipt.observedAt > window.endAt) continue
    if (!Number.isFinite(receipt.amount) || receipt.amount < 0) continue
    if (!deduped.has(receipt.receiptId)) deduped.set(receipt.receiptId, receipt)
  }
  return [...deduped.values()]
}

function aggregateStage(input: {
  stage: ReleaseMetricStage
  required: boolean
  configured: boolean
  authorizationRequired: boolean
  samples: readonly ReleaseMetricSample[]
}): ReleaseMetricAggregate {
  const values = input.samples
    .filter((sample) => sample.stage === input.stage)
    .map((sample) => Math.round(sample.durationMs))
  const observation: ReleaseMetricObservation =
    values.length > 0
      ? "measured"
      : input.authorizationRequired
        ? "authorization_required"
        : input.configured
          ? "not_observed"
          : "not_configured"
  return {
    stage: input.stage,
    required: input.required,
    observation,
    count: values.length,
    p50Ms: nearestRank(values, 0.5),
    p95Ms: nearestRank(values, 0.95),
    maxMs: values.length > 0 ? Math.max(...values) : null,
  }
}

function evaluateAdmission(
  metrics: readonly ReleaseMetricAggregate[],
  counters: readonly ReleaseMetricCounterAggregate[],
  requiredCounters: ReadonlySet<ReleaseMetricCounter>,
  baseline: ReleaseMetricBaseline | null,
): ReleaseMetricAdmission {
  const externalBlockers: ReleaseMetricBlocker[] = metrics
    .filter((metric) => metric.required && metric.observation === "authorization_required")
    .map((metric) => ({
      category: "external_input",
      code: "authorization_required",
      stage: metric.stage,
    }))
  if (externalBlockers.length > 0) {
    return {
      status: "blocked_external_input",
      state: "coverage_evaluated",
      blockers: externalBlockers,
    }
  }

  const externalCounterBlockers: ReleaseMetricBlocker[] = counters
    .filter(
      (counter) =>
        requiredCounters.has(counter.counter) && counter.observation === "authorization_required",
    )
    .map((counter) => ({
      category: "external_input",
      code: "authorization_required",
      counter: counter.counter,
    }))
  if (externalCounterBlockers.length > 0) {
    return {
      status: "blocked_external_input",
      state: "coverage_evaluated",
      blockers: externalCounterBlockers,
    }
  }

  const coverageBlockers: ReleaseMetricBlocker[] = metrics.flatMap((metric) => {
    if (!metric.required || metric.observation === "measured") return []
    return [
      {
        category: "metric_coverage" as const,
        code:
          metric.observation === "not_configured"
            ? ("required_metric_not_configured" as const)
            : ("required_metric_not_observed" as const),
        stage: metric.stage,
      },
    ]
  })
  if (coverageBlockers.length > 0) {
    return { status: "rejected", state: "coverage_evaluated", blockers: coverageBlockers }
  }
  const counterCoverageBlockers: ReleaseMetricBlocker[] = counters.flatMap((counter) => {
    if (!requiredCounters.has(counter.counter) || counter.observation === "measured") return []
    return [
      {
        category: "metric_coverage" as const,
        code:
          counter.observation === "not_configured"
            ? ("required_counter_not_configured" as const)
            : ("required_counter_not_observed" as const),
        counter: counter.counter,
      },
    ]
  })
  if (counterCoverageBlockers.length > 0) {
    return {
      status: "rejected",
      state: "coverage_evaluated",
      blockers: counterCoverageBlockers,
    }
  }
  if (!baseline) {
    return {
      status: "rejected",
      state: "baseline_evaluated",
      blockers: [{ category: "baseline_required", code: "approved_baseline_missing" }],
    }
  }

  const baselineBlockers: ReleaseMetricBlocker[] = metrics
    .filter((metric) => metric.required && !baseline.stageLimits[metric.stage])
    .map((metric) => ({
      category: "baseline_required",
      code: "stage_baseline_missing",
      stage: metric.stage,
    }))
  if (baselineBlockers.length > 0) {
    return { status: "rejected", state: "baseline_evaluated", blockers: baselineBlockers }
  }

  const regressionBlockers: ReleaseMetricBlocker[] = []
  for (const metric of metrics) {
    const limit = baseline.stageLimits[metric.stage]
    if (!limit || metric.observation !== "measured") continue
    if (metric.p95Ms !== null && metric.p95Ms > limit.p95MaxMs) {
      regressionBlockers.push({
        category: "product_regression",
        code: "p95_limit_exceeded",
        stage: metric.stage,
      })
    }
    if (limit.maxMs !== undefined && metric.maxMs !== null && metric.maxMs > limit.maxMs) {
      regressionBlockers.push({
        category: "product_regression",
        code: "max_limit_exceeded",
        stage: metric.stage,
      })
    }
  }
  return regressionBlockers.length > 0
    ? { status: "rejected", state: "rejected", blockers: regressionBlockers }
    : { status: "admitted", state: "admitted", blockers: [] }
}

function aggregateCounter(input: {
  counter: ReleaseMetricCounter
  receipts: readonly ReleaseMetricCounterReceipt[]
  measured: boolean
  configured: boolean
  authorizationRequired: boolean
}): ReleaseMetricCounterAggregate {
  const receipts = input.receipts.filter((receipt) => receipt.counter === input.counter)
  if (receipts.length > 0 || input.measured) {
    return {
      counter: input.counter,
      observation: "measured",
      count: receipts.reduce((sum, receipt) => sum + receipt.amount, 0),
    }
  }
  return {
    counter: input.counter,
    observation: input.authorizationRequired
      ? "authorization_required"
      : input.configured
        ? "not_observed"
        : "not_configured",
    count: null,
  }
}

export function buildReleaseWindowMetricReport(input: {
  window: ReleaseMetricWindow
  source: ReleaseMetricSourceSnapshot
  requiredStages: readonly ReleaseMetricStage[]
  configuredStages: readonly ReleaseMetricStage[]
  authorizationRequiredStages?: readonly ReleaseMetricStage[] | undefined
  requiredCounters?: readonly ReleaseMetricCounter[] | undefined
  configuredCounters?: readonly ReleaseMetricCounter[] | undefined
  authorizationRequiredCounters?: readonly ReleaseMetricCounter[] | undefined
  baseline: ReleaseMetricBaseline | null
}): ReleaseMetricReport {
  const required = new Set(input.requiredStages)
  const configured = new Set(input.configuredStages)
  const authorizationRequired = new Set(input.authorizationRequiredStages ?? [])
  const requiredCounters = new Set(input.requiredCounters ?? [])
  const configuredCounters = new Set(input.configuredCounters ?? [])
  const authorizationRequiredCounters = new Set(input.authorizationRequiredCounters ?? [])
  const samples = dedupeSamples(input.source.samples, input.window)
  const counterReceipts = dedupeCounters(input.source.counters, input.window)
  const relevantStages = ALL_STAGES.filter(
    (stage) =>
      required.has(stage) ||
      configured.has(stage) ||
      samples.some((sample) => sample.stage === stage),
  )
  const metrics = relevantStages.map((stage) =>
    aggregateStage({
      stage,
      required: required.has(stage),
      configured: configured.has(stage),
      authorizationRequired: authorizationRequired.has(stage),
      samples,
    }),
  )
  const counters = ALL_COUNTERS.map((counter) =>
    aggregateCounter({
      counter,
      receipts: counterReceipts,
      measured: input.source.measuredCounters.includes(counter),
      configured: configuredCounters.has(counter),
      authorizationRequired: authorizationRequiredCounters.has(counter),
    }),
  )

  return {
    kind: "knowbee.release.window_metrics",
    window: { ...input.window },
    sourceRunCount: Math.max(0, input.source.runCount),
    terminalRunCount: Math.max(0, input.source.terminalRunCount),
    sampleCount: samples.length,
    sourceIssues: input.source.issues.map((issue) => ({ ...issue })),
    metrics,
    counters,
    baselineId: input.baseline?.baselineId ?? null,
    admission: evaluateAdmission(metrics, counters, requiredCounters, input.baseline),
  }
}

export function projectReleaseMetricProductLog(report: ReleaseMetricReport): {
  windowId: string
  sampleCount: number
  runCount: number
  admissionStatus: ReleaseMetricAdmission["status"]
  blockerCategoryCounts: Partial<Record<ReleaseMetricBlockerCategory, number>>
} {
  const blockerCategoryCounts: Partial<Record<ReleaseMetricBlockerCategory, number>> = {}
  for (const blocker of report.admission.blockers) {
    blockerCategoryCounts[blocker.category] = (blockerCategoryCounts[blocker.category] ?? 0) + 1
  }
  return {
    windowId: report.window.windowId,
    sampleCount: report.sampleCount,
    runCount: report.sourceRunCount,
    admissionStatus: report.admission.status,
    blockerCategoryCounts,
  }
}

export function projectReleaseMetricFieldDebugLog(report: ReleaseMetricReport): {
  windowId: string
  metrics: readonly ReleaseMetricAggregate[]
  counters: ReleaseMetricReport["counters"]
  sourceIssues: readonly ReleaseMetricSourceIssue[]
} {
  return {
    windowId: report.window.windowId,
    metrics: report.metrics.map((metric) => ({ ...metric })),
    counters: report.counters.map((counter) => ({ ...counter })),
    sourceIssues: report.sourceIssues.map((issue) => ({ ...issue })),
  }
}
