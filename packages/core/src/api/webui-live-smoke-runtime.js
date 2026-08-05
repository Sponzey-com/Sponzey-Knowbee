import { DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS, observeLiveSmokeTerminal, } from "../channels/live-smoke-terminal-observer.js";
export function createWebUiLiveSmokeRuntimePorts(dependencies) {
    const completions = new Map();
    const timeoutMs = Math.max(1, Math.floor(dependencies.timeoutMs ?? DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS));
    const now = dependencies.now ?? Date.now;
    return {
        startRequest(input) {
            const startedAt = now();
            const ingress = dependencies.startCanonicalRequest(input.request);
            const started = {
                requestId: ingress.requestId,
                runId: ingress.started.runId,
                requestGroupId: ingress.started.runId,
            };
            completions.set(started.runId, {
                finished: ingress.started.finished,
                startedAt,
            });
            return started;
        },
        async observeTerminal(input) {
            const completion = completions.get(input.started.runId);
            try {
                const observed = await observeLiveSmokeTerminal({
                    started: input.started,
                    completion: completion?.finished,
                    observabilityRepository: dependencies.observabilityRepository,
                    listTopologyRunsForRootRun: dependencies.listTopologyRunsForRootRun,
                    readExecutionOutcome: dependencies.readExecutionOutcome,
                    readDecisionReceiptRefs: dependencies.readDecisionReceiptRefs,
                    readFirstResponseLatency: dependencies.readFirstResponseLatency,
                    ...(completion ? { startedAt: completion.startedAt } : {}),
                    now,
                    timeoutMs,
                    ...(input.signal ? { signal: input.signal } : {}),
                    completionRejection: "interrupted",
                });
                if (observed.projection.terminalStatus === "timed_out") {
                    dependencies.cancelRun?.(input.started.runId);
                }
                if (!observed.run)
                    return observed.projection;
                return {
                    ...observed.projection,
                    ...dependencies.readEvidence(observed.run),
                };
            }
            finally {
                completions.delete(input.started.runId);
            }
        },
    };
}
//# sourceMappingURL=webui-live-smoke-runtime.js.map