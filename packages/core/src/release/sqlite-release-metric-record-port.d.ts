import type { ReleaseMetricRecordPort } from "./release-window-metrics-use-case.js";
import type { ReleaseMetricSourceSnapshot, ReleaseMetricWindow } from "./release-window-metrics.js";
export declare class SqliteReleaseMetricRecordPort implements ReleaseMetricRecordPort {
    loadWindow(window: ReleaseMetricWindow): ReleaseMetricSourceSnapshot;
}
//# sourceMappingURL=sqlite-release-metric-record-port.d.ts.map