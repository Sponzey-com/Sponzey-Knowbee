import { type ReleaseMetricBaseline, type ReleaseMetricCounter, type ReleaseMetricReport, type ReleaseMetricSourceSnapshot, type ReleaseMetricStage, type ReleaseMetricWindow } from "./release-window-metrics.js";
export interface ReleaseMetricRecordPort {
    loadWindow(window: ReleaseMetricWindow): ReleaseMetricSourceSnapshot;
}
export declare function collectReleaseWindowMetricReport(input: {
    window: ReleaseMetricWindow;
    requiredStages: readonly ReleaseMetricStage[];
    configuredStages: readonly ReleaseMetricStage[];
    authorizationRequiredStages?: readonly ReleaseMetricStage[] | undefined;
    requiredCounters?: readonly ReleaseMetricCounter[] | undefined;
    configuredCounters?: readonly ReleaseMetricCounter[] | undefined;
    authorizationRequiredCounters?: readonly ReleaseMetricCounter[] | undefined;
    baseline: ReleaseMetricBaseline | null;
    recordPort: ReleaseMetricRecordPort;
}): ReleaseMetricReport;
//# sourceMappingURL=release-window-metrics-use-case.d.ts.map