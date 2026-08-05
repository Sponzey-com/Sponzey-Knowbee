import {
  type ReleaseMetricBaseline,
  type ReleaseMetricCounter,
  type ReleaseMetricReport,
  type ReleaseMetricSourceSnapshot,
  type ReleaseMetricStage,
  type ReleaseMetricWindow,
  buildReleaseWindowMetricReport,
} from "./release-window-metrics.js"

export interface ReleaseMetricRecordPort {
  loadWindow(window: ReleaseMetricWindow): ReleaseMetricSourceSnapshot
}

export function collectReleaseWindowMetricReport(input: {
  window: ReleaseMetricWindow
  requiredStages: readonly ReleaseMetricStage[]
  configuredStages: readonly ReleaseMetricStage[]
  authorizationRequiredStages?: readonly ReleaseMetricStage[] | undefined
  requiredCounters?: readonly ReleaseMetricCounter[] | undefined
  configuredCounters?: readonly ReleaseMetricCounter[] | undefined
  authorizationRequiredCounters?: readonly ReleaseMetricCounter[] | undefined
  baseline: ReleaseMetricBaseline | null
  recordPort: ReleaseMetricRecordPort
}): ReleaseMetricReport {
  const source = input.recordPort.loadWindow(input.window)
  return buildReleaseWindowMetricReport({
    window: input.window,
    source,
    requiredStages: input.requiredStages,
    configuredStages: input.configuredStages,
    ...(input.authorizationRequiredStages
      ? { authorizationRequiredStages: input.authorizationRequiredStages }
      : {}),
    ...(input.requiredCounters ? { requiredCounters: input.requiredCounters } : {}),
    ...(input.configuredCounters ? { configuredCounters: input.configuredCounters } : {}),
    ...(input.authorizationRequiredCounters
      ? { authorizationRequiredCounters: input.authorizationRequiredCounters }
      : {}),
    baseline: input.baseline,
  })
}
