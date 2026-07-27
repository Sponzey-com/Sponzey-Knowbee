import type {
  LatencyMetricRecord,
  LatencyMetricStatus,
} from "../observability/latency.js"

export interface LiveSmokeFirstResponseLatencyEvidence {
  metricId: string
  runId: string
  requestGroupId: string
  durationMs: number
  budgetMs: number
  status: LatencyMetricStatus
}

export type LiveSmokeFirstResponseLatencyReader = (
  runId: string,
  requestGroupId: string,
) => LiveSmokeFirstResponseLatencyEvidence | undefined

export function createLiveSmokeFirstResponseLatencyReader(
  repository: Readonly<{ list(): readonly LatencyMetricRecord[] }>,
): LiveSmokeFirstResponseLatencyReader {
  return (runId, requestGroupId) => {
    const metric = [...repository.list()]
      .reverse()
      .find(
        (candidate) =>
          candidate.name === "first_response_latency_ms"
          && candidate.runId === runId
          && candidate.requestGroupId === requestGroupId,
      )
    if (!metric) return undefined
    return {
      metricId: metric.id,
      runId,
      requestGroupId,
      durationMs: metric.durationMs,
      budgetMs: metric.budgetMs,
      status: metric.status,
    }
  }
}
