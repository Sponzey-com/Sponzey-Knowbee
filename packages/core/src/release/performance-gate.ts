import {
  type FastResponseHealthSnapshot,
  LATENCY_BUDGET_MS,
  type LatencyMetricName,
  type LatencyMetricRecord,
  type LatencyMetricStatus,
  getFastResponseHealthSnapshot,
  listLatencyMetrics,
} from "../observability/latency.js"

export type ReleasePerformanceGateStatus = "passed" | "warning" | "failed"
export type ReleasePerformanceTargetKind = "latency" | "counter"

export interface ReleasePerformanceAcceptanceEvidence {
  status: "baseline_only" | "accepted" | "rejected"
  matrixId: string | null
  matrixVersion: number | null
  baselineVersion: string | null
  authorizationId: string | null
  reasonCodes: string[]
}

export interface ReleasePerformanceTarget {
  id: string
  kind: ReleasePerformanceTargetKind
  title: string
  requiredForPublicRelease: boolean
  metricName?: LatencyMetricName
  budgetMs?: number
  budgetPurpose?: "operational_health"
  targetDescription: string
}

export interface ReleasePerformanceMetricResult {
  targetId: string
  title: string
  kind: ReleasePerformanceTargetKind
  metricName?: LatencyMetricName
  budgetMs: number | null
  count: number
  p95Ms: number | null
  lastMs: number | null
  status: LatencyMetricStatus | "missing"
  warning: string | null
}

export interface ReleasePerformanceCounterResult {
  id: "delivery_dedupe_count" | "concurrency_blocked_count"
  count: number
  status: "ok" | "warning"
  warning: string | null
}

export interface ReleasePerformanceSummary {
  kind: "knowbee.release.performance"
  generatedAt: string
  windowMs: number
  gateStatus: ReleasePerformanceGateStatus
  operationalStatus: ReleasePerformanceGateStatus
  fastResponseHealth: FastResponseHealthSnapshot
  targets: ReleasePerformanceTarget[]
  metrics: ReleasePerformanceMetricResult[]
  counters: ReleasePerformanceCounterResult[]
  missingRequiredMetrics: string[]
  warnings: string[]
  blockingFailures: string[]
  acceptance: ReleasePerformanceAcceptanceEvidence
}

export const RELEASE_PERFORMANCE_TARGETS: ReleasePerformanceTarget[] = [
  latencyTarget(
    "intake_latency",
    "Request intake latency",
    "ingress_ack_latency_ms",
    "The user-facing request receipt path should start within 1 second.",
  ),
  latencyTarget(
    "registry_lookup_latency",
    "Registry lookup latency",
    "registry_lookup_latency_ms",
    "Mode decision and registry snapshot lookup should finish within 500ms.",
  ),
  latencyTarget(
    "orchestration_mode_latency",
    "Orchestration mode decision latency",
    "orchestration_mode_latency_ms",
    "The orchestration mode resolver should stay within the local 500ms budget.",
  ),
  latencyTarget(
    "orchestration_planning_latency",
    "Orchestration planning latency",
    "orchestration_planning_latency_ms",
    "Normal orchestration plans should be built within 2 seconds.",
  ),
  latencyTarget(
    "sub_session_queue_wait",
    "Sub-session queue wait",
    "sub_session_queue_wait_ms",
    "Sub-session queueing should record immediate wait reasons and remain under 500ms in normal local runs.",
  ),
  latencyTarget(
    "first_progress_latency",
    "First progress latency",
    "first_progress_latency_ms",
    "Long work should emit the first progress signal within 3 seconds.",
  ),
  latencyTarget(
    "approval_aggregation_latency",
    "Approval aggregation latency",
    "approval_aggregation_latency_ms",
    "Parallel approval items should be aggregated within 1 second.",
  ),
  latencyTarget(
    "finalization_latency",
    "Finalization latency",
    "finalization_latency_ms",
    "Parent finalization should complete within 1.5 seconds after verified completion.",
  ),
  latencyTarget(
    "delivery_latency",
    "Delivery latency",
    "delivery_latency_ms",
    "Channel delivery should complete within 1.5 seconds for local dry-run paths.",
  ),
  latencyTarget(
    "webui_live_update_latency",
    "WebUI live update latency",
    "webui_live_update_latency_ms",
    "WebUI live updates should reflect backend events within 1 second.",
  ),
  latencyTarget(
    "resource_lock_wait",
    "Resource lock wait",
    "resource_lock_wait_ms",
    "Resource lock wait must be measured and normally stay under 500ms.",
  ),
  {
    id: "delivery_dedupe_count",
    kind: "counter",
    title: "Delivery dedupe count",
    requiredForPublicRelease: true,
    targetDescription:
      "Release summary must expose how many final/progress deliveries were suppressed as duplicates.",
  },
  {
    id: "concurrency_blocked_count",
    kind: "counter",
    title: "Concurrency blocked count",
    requiredForPublicRelease: true,
    targetDescription:
      "Release summary must expose how many sub-sessions were blocked by concurrency or resource limits.",
  },
]

function latencyTarget(
  id: string,
  title: string,
  metricName: LatencyMetricName,
  targetDescription: string,
): ReleasePerformanceTarget {
  return {
    id,
    kind: "latency",
    title,
    requiredForPublicRelease: true,
    metricName,
    budgetMs: LATENCY_BUDGET_MS[metricName],
    budgetPurpose: "operational_health",
    targetDescription,
  }
}

function normalizeAcceptanceEvidence(
  evidence: ReleasePerformanceAcceptanceEvidence | undefined,
): ReleasePerformanceAcceptanceEvidence {
  if (!evidence) {
    return {
      status: "baseline_only",
      matrixId: null,
      matrixVersion: null,
      baselineVersion: null,
      authorizationId: null,
      reasonCodes: ["performance_acceptance_evidence_missing"],
    }
  }
  if (evidence.status === "rejected") {
    return {
      ...evidence,
      reasonCodes:
        evidence.reasonCodes.length > 0
          ? [...evidence.reasonCodes]
          : ["performance_acceptance_rejected"],
    }
  }
  if (evidence.status === "baseline_only") {
    return {
      ...evidence,
      reasonCodes:
        evidence.reasonCodes.length > 0
          ? [...evidence.reasonCodes]
          : ["performance_acceptance_baseline_only"],
    }
  }
  if (
    !evidence.matrixId?.trim() ||
    !Number.isSafeInteger(evidence.matrixVersion) ||
    (evidence.matrixVersion ?? 0) < 1 ||
    !evidence.baselineVersion?.trim() ||
    !evidence.authorizationId?.trim() ||
    evidence.reasonCodes.length > 0
  ) {
    return {
      status: "baseline_only",
      matrixId: evidence.matrixId,
      matrixVersion: evidence.matrixVersion,
      baselineVersion: evidence.baselineVersion,
      authorizationId: evidence.authorizationId,
      reasonCodes: ["performance_acceptance_evidence_invalid"],
    }
  }
  return { ...evidence, reasonCodes: [] }
}

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index] ?? null
}

function worstLatencyStatus(records: LatencyMetricRecord[]): LatencyMetricStatus | "missing" {
  if (records.length === 0) return "missing"
  if (records.some((record) => record.status === "timeout")) return "timeout"
  if (records.some((record) => record.status === "slow")) return "slow"
  return "ok"
}

function metricWarning(input: {
  target: ReleasePerformanceTarget
  status: ReleasePerformanceMetricResult["status"]
  p95Ms: number | null
}): string | null {
  if (input.status === "missing")
    return `${input.target.id}: metric was not collected in the release window.`
  if (input.status === "timeout") return `${input.target.id}: at least one timeout occurred.`
  if (input.status === "slow") return `${input.target.id}: latency budget was exceeded.`
  if (input.target.budgetMs != null && input.p95Ms != null && input.p95Ms > input.target.budgetMs) {
    return `${input.target.id}: p95 ${input.p95Ms}ms exceeds budget ${input.target.budgetMs}ms.`
  }
  return null
}

export function buildReleasePerformanceSummary(
  input: {
    now?: Date
    windowMs?: number
    metrics?: LatencyMetricRecord[]
    deliveryDedupeCount?: number
    concurrencyBlockedCount?: number
    acceptanceEvidence?: ReleasePerformanceAcceptanceEvidence
  } = {},
): ReleasePerformanceSummary {
  const now = input.now ?? new Date()
  const windowMs = Math.max(1, input.windowMs ?? 15 * 60 * 1000)
  const nowMs = now.getTime()
  const metrics = (input.metrics ?? listLatencyMetrics()).filter(
    (record) => nowMs - record.createdAt <= windowMs,
  )
  const metricResults = RELEASE_PERFORMANCE_TARGETS.filter(
    (target) => target.kind === "latency" && target.metricName,
  ).map((target): ReleasePerformanceMetricResult => {
    const records = metrics.filter((record) => record.name === target.metricName)
    const p95Ms = percentile95(records.map((record) => record.durationMs))
    const last = records[records.length - 1]
    const status = worstLatencyStatus(records)
    return {
      targetId: target.id,
      title: target.title,
      kind: target.kind,
      budgetMs: target.budgetMs ?? null,
      count: records.length,
      p95Ms,
      lastMs: last?.durationMs ?? null,
      status,
      warning: metricWarning({ target, status, p95Ms }),
      ...(target.metricName ? { metricName: target.metricName } : {}),
    }
  })
  const counters: ReleasePerformanceCounterResult[] = [
    {
      id: "delivery_dedupe_count",
      count: Math.max(0, input.deliveryDedupeCount ?? 0),
      status: "ok",
      warning: null,
    },
    {
      id: "concurrency_blocked_count",
      count: Math.max(0, input.concurrencyBlockedCount ?? 0),
      status: "ok",
      warning: null,
    },
  ]
  const missingRequiredMetrics = metricResults
    .filter(
      (metric) =>
        metric.status === "missing" &&
        RELEASE_PERFORMANCE_TARGETS.find((target) => target.id === metric.targetId)
          ?.requiredForPublicRelease,
    )
    .map((metric) => metric.targetId)
  const warnings = [
    ...metricResults
      .map((metric) => metric.warning)
      .filter((warning): warning is string => Boolean(warning)),
    ...counters
      .map((counter) => counter.warning)
      .filter((warning): warning is string => Boolean(warning)),
  ]
  const blockingFailures = metricResults
    .filter((metric) => metric.status === "timeout")
    .map((metric) => `${metric.targetId}: timeout recorded`)
  const operationalStatus: ReleasePerformanceGateStatus =
    blockingFailures.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed"
  const acceptance = normalizeAcceptanceEvidence(input.acceptanceEvidence)
  if (acceptance.status === "baseline_only") {
    blockingFailures.push(...acceptance.reasonCodes)
  } else if (acceptance.status === "rejected") {
    blockingFailures.push("performance_acceptance_rejected")
  }
  const gateStatus: ReleasePerformanceGateStatus =
    blockingFailures.length > 0 ? "failed" : operationalStatus

  return {
    kind: "knowbee.release.performance",
    generatedAt: now.toISOString(),
    windowMs,
    gateStatus,
    operationalStatus,
    fastResponseHealth: getFastResponseHealthSnapshot({ now: nowMs, windowMs }),
    targets: RELEASE_PERFORMANCE_TARGETS,
    metrics: metricResults,
    counters,
    missingRequiredMetrics,
    warnings,
    blockingFailures,
    acceptance,
  }
}
