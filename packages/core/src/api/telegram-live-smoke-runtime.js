import { createHash } from "node:crypto";
import { DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS, observeLiveSmokeTerminal, } from "../channels/live-smoke-terminal-observer.js";
function targetFingerprint(target) {
    const digest = createHash("sha256")
        .update(JSON.stringify([target.chatId, target.userId, target.threadId ?? null]))
        .digest("hex")
        .slice(0, 24);
    return `telegram-target:${digest}`;
}
export function createTelegramLiveSmokeRuntimePorts(dependencies) {
    const completions = new Map();
    const timeoutMs = Math.max(1, Math.floor(dependencies.timeoutMs ?? DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS));
    const fingerprint = targetFingerprint(dependencies.target);
    const now = dependencies.now ?? Date.now;
    return {
        async startRequest(input) {
            const startedAt = now();
            const ingress = await dependencies.startCanonicalRequest({
                request: input.request,
                target: dependencies.target,
            });
            completions.set(ingress.runId, {
                finished: ingress.finished,
                startedAt,
            });
            return {
                requestId: ingress.requestId,
                runId: ingress.runId,
                requestGroupId: ingress.requestGroupId,
                targetFingerprint: fingerprint,
            };
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
                    completionRejection: "throw",
                });
                if (observed.projection.terminalStatus === "timed_out") {
                    dependencies.cancelRun?.(input.started.runId);
                }
                if (!observed.run)
                    return unavailableObservation(observed.projection, fingerprint);
                return {
                    ...observed.projection,
                    targetFingerprint: fingerprint,
                    ...dependencies.readEvidence(observed.run, dependencies.target),
                };
            }
            finally {
                completions.delete(input.started.runId);
            }
        },
    };
}
function unavailableObservation(projection, fingerprint) {
    return {
        ...projection,
        targetFingerprint: fingerprint,
        providerDeliveryReceipted: false,
        targetMatched: false,
        userReportDelivered: false,
        userReportDeliveryCount: 0,
    };
}
//# sourceMappingURL=telegram-live-smoke-runtime.js.map