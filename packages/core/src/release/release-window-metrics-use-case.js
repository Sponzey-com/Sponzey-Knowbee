import { buildReleaseWindowMetricReport, } from "./release-window-metrics.js";
export function collectReleaseWindowMetricReport(input) {
    const source = input.recordPort.loadWindow(input.window);
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
    });
}
//# sourceMappingURL=release-window-metrics-use-case.js.map