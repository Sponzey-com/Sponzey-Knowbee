import { observeGatewayStartup } from "../contracts/gateway-startup-state.js";
function elapsed(input) {
    return Math.max(0, input.observedAt - input.startedAt);
}
function performance(elapsedMs, performanceBudgetMs) {
    return elapsedMs > performanceBudgetMs ? "budget_exceeded" : "within_budget";
}
export async function observeGatewayStartupEvidence(input) {
    const process = await input.processPort.inspect(input.expectedPid);
    const identityElapsedMs = elapsed({
        observedAt: input.observedAt,
        startedAt: input.minimumStartedAt,
    });
    const evidence = input.evidence;
    const evidenceMatches = evidence !== null &&
        evidence.pid === input.expectedPid &&
        evidence.startedAt >= input.minimumStartedAt;
    const observationElapsedMs = evidenceMatches
        ? elapsed({ observedAt: input.observedAt, startedAt: evidence.startedAt })
        : identityElapsedMs;
    if (process.state === "exited") {
        return {
            status: "failed",
            elapsedMs: observationElapsedMs,
            reasonCode: "process_exited",
        };
    }
    if (process.state === "unknown") {
        if (evidenceMatches
            && (evidence.state === "failed" || evidence.state === "cancelled")) {
            const terminalObservation = observeGatewayStartup({
                snapshot: evidence,
                processState: "running",
                observedAt: input.observedAt,
                performanceBudgetMs: input.performanceBudgetMs,
            });
            return terminalObservation.status === "still_starting"
                ? { ...terminalObservation, state: evidence.state }
                : terminalObservation;
        }
        return {
            status: "still_starting",
            state: evidenceMatches ? "verifying_process" : "awaiting_evidence",
            elapsedMs: observationElapsedMs,
            performance: performance(observationElapsedMs, input.performanceBudgetMs),
        };
    }
    if (!evidenceMatches) {
        return {
            status: "still_starting",
            state: "awaiting_evidence",
            elapsedMs: identityElapsedMs,
            performance: performance(identityElapsedMs, input.performanceBudgetMs),
        };
    }
    if (!process.repositoryOwned) {
        return {
            status: "failed",
            elapsedMs: observationElapsedMs,
            reasonCode: "runtime_ownership_mismatch",
        };
    }
    const observation = observeGatewayStartup({
        snapshot: evidence,
        processState: process.state,
        observedAt: input.observedAt,
        performanceBudgetMs: input.performanceBudgetMs,
    });
    if (observation.status !== "ready") {
        return observation.status === "still_starting"
            ? { ...observation, state: evidence.state }
            : observation;
    }
    if (!process.listening) {
        return {
            status: "still_starting",
            state: "verifying_ready",
            elapsedMs: observation.elapsedMs,
            performance: performance(observation.elapsedMs, input.performanceBudgetMs),
        };
    }
    return observation;
}
//# sourceMappingURL=gateway-startup-observer.js.map