export const REQUIRED_REPRESENTATIVE_FLOW_IDS = [
  "direct_answer",
  "current_fact_read",
  "tool_write",
  "child_delegation",
  "cancel",
] as const

export type RepresentativeFlowId = (typeof REQUIRED_REPRESENTATIVE_FLOW_IDS)[number]
export type PerformanceSampleSourceKind = "deterministic_fixture" | "live_runtime"

export interface RepresentativeFlowSample {
  flowId: RepresentativeFlowId
  sampleId: string
  durationMs: number
  llmCallCount: number
  inputTokens: number
  outputTokens: number
  costEstimateUsd: number
  attemptCount: number
  queueWaitMs: number
  eventBytes: number
  evidenceBytes: number
}

export interface PerformanceBaselineDiagnostic {
  code: "required_flow_missing" | "unknown_flow" | "sample_metric_invalid"
  flowId: string
  metric: string | null
}

interface MetricTotals {
  llmCallCount: number
  inputTokens: number
  outputTokens: number
  costEstimateUsd: number
  attemptCount: number
  queueWaitMs: number
  eventBytes: number
  evidenceBytes: number
}

export interface RepresentativeFlowBaselineResult {
  schemaVersion: 1
  fixtureVersion: string
  sourceKind: PerformanceSampleSourceKind
  complete: boolean
  counts: { requiredFlows: number; coveredFlows: number; samples: number }
  flows: Array<
    MetricTotals & {
      flowId: RepresentativeFlowId
      sampleCount: number
      latencyP50Ms: number
      latencyP95Ms: number
    }
  >
  aggregate: MetricTotals & { sampleCount: number; latencyP50Ms: number; latencyP95Ms: number }
  diagnostics: PerformanceBaselineDiagnostic[]
}

export interface MeasuredFlowStageSummary {
  stage: string
  llmCallCount: number
  durationMs: number
  inputTokens: number | null
  outputTokens: number | null
}

export interface MeasuredRepresentativeFlowSample {
  flowId: RepresentativeFlowId
  sampleId: string
  sourceKind: "live_runtime"
  durationMs: number
  llmCallCount: number
  inputTokens: number | null
  outputTokens: number | null
  costEstimateUsd: number | null
  attemptCount: number
  queueWaitMs: number
  eventBytes: number
  evidenceBytes: number
  stages: MeasuredFlowStageSummary[]
  complete: boolean
  diagnostics: string[]
}

export type PerformanceAcceptanceStatus = "baseline_only" | "accepted" | "rejected"

export interface PerformanceAcceptanceThresholds {
  maxLatencyRegressionRatio: number
  maxLlmCallIncrease: number
  maxAttemptIncrease: number
}

export type PerformanceReferenceFlow = Pick<
  RepresentativeFlowBaselineResult["flows"][number],
  "flowId" | "latencyP95Ms" | "llmCallCount" | "attemptCount"
>

const MEASURED_STAGE_ORDER = [
  "intake",
  "planning",
  "execution",
  "review",
  "final_response",
  "maintenance",
  "other",
] as const

export function buildMeasuredRepresentativeFlowSample(input: {
  flowId: RepresentativeFlowId
  sampleId: string
  startedAt: number
  finishedAt: number
  llmReceipts: ReadonlyArray<{
    invocationId: string
    phase: "started" | "completed" | "failed" | "cancelled"
    at: number
    context: { stage: string }
    durationMs?: number | undefined
    inputTokens?: number | undefined
    outputTokens?: number | undefined
  }>
  costEstimateUsd: number | null
  attemptCount: number
  queueWaitMs: number
  eventBytes: number
  evidenceBytes: number
}): MeasuredRepresentativeFlowSample {
  const terminalByInvocation = new Map<string, (typeof input.llmReceipts)[number]>()
  const duplicateTerminalInvocationIds = new Set<string>()
  for (const receipt of input.llmReceipts) {
    if (receipt.phase === "started") continue
    const existing = terminalByInvocation.get(receipt.invocationId)
    if (existing) duplicateTerminalInvocationIds.add(receipt.invocationId)
    if (!existing || receipt.at < existing.at)
      terminalByInvocation.set(receipt.invocationId, receipt)
  }
  const terminal = [...terminalByInvocation.values()]
  const diagnostics: string[] = []
  if (!Number.isSafeInteger(input.startedAt) || !Number.isSafeInteger(input.finishedAt)) {
    diagnostics.push("run_timing_invalid")
  }
  if (input.finishedAt < input.startedAt) diagnostics.push("run_timing_reversed")
  if (duplicateTerminalInvocationIds.size > 0) diagnostics.push("llm_terminal_duplicate")
  if (terminal.some((receipt) => !Number.isSafeInteger(receipt.durationMs))) {
    diagnostics.push("llm_terminal_duration_missing")
  }
  const measuredCounters = {
    attemptCount: input.attemptCount,
    queueWaitMs: input.queueWaitMs,
    eventBytes: input.eventBytes,
    evidenceBytes: input.evidenceBytes,
  }
  for (const [metric, value] of Object.entries(measuredCounters)) {
    if (!Number.isSafeInteger(value) || value < 0) diagnostics.push(`measurement_invalid:${metric}`)
  }
  if (
    input.costEstimateUsd !== null &&
    (!Number.isFinite(input.costEstimateUsd) || input.costEstimateUsd < 0)
  ) {
    diagnostics.push("measurement_invalid:costEstimateUsd")
  }
  const totalTokens = (key: "inputTokens" | "outputTokens"): number | null =>
    terminal.every((receipt) => Number.isSafeInteger(receipt[key]))
      ? terminal.reduce((sum, receipt) => sum + (receipt[key] ?? 0), 0)
      : null
  const stages = [...new Set(terminal.map((receipt) => receipt.context.stage))]
    .sort((left, right) => {
      const leftIndex = MEASURED_STAGE_ORDER.indexOf(left as (typeof MEASURED_STAGE_ORDER)[number])
      const rightIndex = MEASURED_STAGE_ORDER.indexOf(
        right as (typeof MEASURED_STAGE_ORDER)[number],
      )
      return (
        (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) || left.localeCompare(right)
      )
    })
    .map((stage): MeasuredFlowStageSummary => {
      const receipts = terminal.filter((receipt) => receipt.context.stage === stage)
      const stageTokens = (key: "inputTokens" | "outputTokens"): number | null =>
        receipts.every((receipt) => Number.isSafeInteger(receipt[key]))
          ? receipts.reduce((sum, receipt) => sum + (receipt[key] ?? 0), 0)
          : null
      return {
        stage,
        llmCallCount: receipts.length,
        durationMs: receipts.reduce((sum, receipt) => sum + (receipt.durationMs ?? 0), 0),
        inputTokens: stageTokens("inputTokens"),
        outputTokens: stageTokens("outputTokens"),
      }
    })
  return {
    flowId: input.flowId,
    sampleId: input.sampleId,
    sourceKind: "live_runtime",
    durationMs: Math.max(0, input.finishedAt - input.startedAt),
    llmCallCount: terminal.length,
    inputTokens: totalTokens("inputTokens"),
    outputTokens: totalTokens("outputTokens"),
    costEstimateUsd: input.costEstimateUsd,
    attemptCount: input.attemptCount,
    queueWaitMs: input.queueWaitMs,
    eventBytes: input.eventBytes,
    evidenceBytes: input.evidenceBytes,
    stages,
    complete: diagnostics.length === 0,
    diagnostics,
  }
}

export function compareMeasuredFlowToBaseline(input: {
  reference: PerformanceReferenceFlow
  live: MeasuredRepresentativeFlowSample
  thresholds?: PerformanceAcceptanceThresholds | undefined
}): {
  status: PerformanceAcceptanceStatus
  latencyRegressionRatio: number
  llmCallIncrease: number
  attemptIncrease: number
  reasonCodes: string[]
} {
  const latencyRegressionRatio = Number(
    (input.live.durationMs / Math.max(1, input.reference.latencyP95Ms)).toFixed(6),
  )
  const llmCallIncrease = input.live.llmCallCount - input.reference.llmCallCount
  const attemptIncrease = input.live.attemptCount - input.reference.attemptCount
  if (!input.live.complete) {
    return {
      status: "baseline_only",
      latencyRegressionRatio,
      llmCallIncrease,
      attemptIncrease,
      reasonCodes: ["live_measurement_incomplete"],
    }
  }
  if (!input.thresholds) {
    return {
      status: "baseline_only",
      latencyRegressionRatio,
      llmCallIncrease,
      attemptIncrease,
      reasonCodes: ["acceptance_thresholds_not_approved"],
    }
  }
  const thresholdValues = Object.values(input.thresholds)
  if (thresholdValues.some((value) => !Number.isFinite(value) || value < 0)) {
    return {
      status: "baseline_only",
      latencyRegressionRatio,
      llmCallIncrease,
      attemptIncrease,
      reasonCodes: ["acceptance_thresholds_invalid"],
    }
  }
  const reasonCodes: string[] = []
  if (latencyRegressionRatio > input.thresholds.maxLatencyRegressionRatio) {
    reasonCodes.push("latency_regression_exceeded")
  }
  if (llmCallIncrease > input.thresholds.maxLlmCallIncrease) {
    reasonCodes.push("llm_call_increase_exceeded")
  }
  if (attemptIncrease > input.thresholds.maxAttemptIncrease) {
    reasonCodes.push("attempt_increase_exceeded")
  }
  return {
    status: reasonCodes.length === 0 ? "accepted" : "rejected",
    latencyRegressionRatio,
    llmCallIncrease,
    attemptIncrease,
    reasonCodes,
  }
}

const COUNT_METRICS = [
  "llmCallCount",
  "inputTokens",
  "outputTokens",
  "attemptCount",
  "eventBytes",
  "evidenceBytes",
] as const
const NUMBER_METRICS = ["durationMs", "costEstimateUsd", "queueWaitMs"] as const

function percentile(values: readonly number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0
}

function totals(samples: readonly RepresentativeFlowSample[]): MetricTotals {
  return samples.reduce<MetricTotals>(
    (sum, sample) => ({
      llmCallCount: sum.llmCallCount + sample.llmCallCount,
      inputTokens: sum.inputTokens + sample.inputTokens,
      outputTokens: sum.outputTokens + sample.outputTokens,
      costEstimateUsd: Number((sum.costEstimateUsd + sample.costEstimateUsd).toFixed(6)),
      attemptCount: sum.attemptCount + sample.attemptCount,
      queueWaitMs: sum.queueWaitMs + sample.queueWaitMs,
      eventBytes: sum.eventBytes + sample.eventBytes,
      evidenceBytes: sum.evidenceBytes + sample.evidenceBytes,
    }),
    {
      llmCallCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      costEstimateUsd: 0,
      attemptCount: 0,
      queueWaitMs: 0,
      eventBytes: 0,
      evidenceBytes: 0,
    },
  )
}

function invalidMetric(sample: RepresentativeFlowSample): string | null {
  for (const metric of COUNT_METRICS) {
    if (!Number.isInteger(sample[metric]) || sample[metric] < 0) return metric
  }
  for (const metric of NUMBER_METRICS) {
    if (!Number.isFinite(sample[metric]) || sample[metric] < 0) return metric
  }
  return null
}

export function auditRepresentativeFlowBaseline(input: {
  fixtureVersion: string
  sourceKind: PerformanceSampleSourceKind
  samples: readonly RepresentativeFlowSample[]
}): RepresentativeFlowBaselineResult {
  const required = new Set<string>(REQUIRED_REPRESENTATIVE_FLOW_IDS)
  const diagnostics: PerformanceBaselineDiagnostic[] = []
  for (const sample of input.samples) {
    if (!required.has(sample.flowId)) {
      diagnostics.push({ code: "unknown_flow", flowId: sample.flowId, metric: null })
      continue
    }
    const metric = invalidMetric(sample)
    if (metric) diagnostics.push({ code: "sample_metric_invalid", flowId: sample.flowId, metric })
  }
  const validSamples = input.samples.filter(
    (sample) => required.has(sample.flowId) && invalidMetric(sample) === null,
  )
  const flows = REQUIRED_REPRESENTATIVE_FLOW_IDS.flatMap((flowId) => {
    const matching = validSamples.filter((sample) => sample.flowId === flowId)
    if (matching.length === 0) {
      diagnostics.push({ code: "required_flow_missing", flowId, metric: null })
      return []
    }
    const durations = matching.map((sample) => sample.durationMs)
    return [
      {
        flowId,
        sampleCount: matching.length,
        latencyP50Ms: percentile(durations, 0.5),
        latencyP95Ms: percentile(durations, 0.95),
        ...totals(matching),
      },
    ]
  })
  const durations = validSamples.map((sample) => sample.durationMs)
  diagnostics.sort((left, right) =>
    `${left.code}:${left.flowId}:${left.metric ?? ""}`.localeCompare(
      `${right.code}:${right.flowId}:${right.metric ?? ""}`,
    ),
  )
  return {
    schemaVersion: 1,
    fixtureVersion: input.fixtureVersion,
    sourceKind: input.sourceKind,
    complete: diagnostics.length === 0,
    counts: {
      requiredFlows: REQUIRED_REPRESENTATIVE_FLOW_IDS.length,
      coveredFlows: flows.length,
      samples: validSamples.length,
    },
    flows,
    aggregate: {
      sampleCount: validSamples.length,
      latencyP50Ms: percentile(durations, 0.5),
      latencyP95Ms: percentile(durations, 0.95),
      ...totals(validSamples),
    },
    diagnostics,
  }
}
