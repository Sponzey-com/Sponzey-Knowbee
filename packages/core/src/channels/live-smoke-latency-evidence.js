export function createLiveSmokeFirstResponseLatencyReader(repository) {
    return (runId, requestGroupId) => {
        const metric = [...repository.list()]
            .reverse()
            .find((candidate) => candidate.name === "first_response_latency_ms"
            && candidate.runId === runId
            && candidate.requestGroupId === requestGroupId);
        if (!metric)
            return undefined;
        return {
            metricId: metric.id,
            runId,
            requestGroupId,
            durationMs: metric.durationMs,
            budgetMs: metric.budgetMs,
            status: metric.status,
        };
    };
}
//# sourceMappingURL=live-smoke-latency-evidence.js.map