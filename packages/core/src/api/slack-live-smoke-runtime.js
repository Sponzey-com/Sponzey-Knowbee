import { createHash } from "node:crypto";
import { observeLiveSmokeTerminal } from "../channels/live-smoke-terminal-observer.js";
const DEFAULT_TIMEOUT_MS = 120_000;
function fingerprint(target) {
    return `slack-target:${createHash("sha256")
        .update(JSON.stringify([target.channelId, target.userId, target.threadTs ?? null]))
        .digest("hex")
        .slice(0, 24)}`;
}
export function createSlackLiveSmokeRuntimePorts(dependencies) {
    const completions = new Map();
    const targets = new Map();
    const timeoutMs = Math.max(1, Math.floor(dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    const targetFingerprint = fingerprint(dependencies.target);
    return {
        async startRequest(input) {
            const ingress = await dependencies.startCanonicalRequest({
                request: input.request,
                target: dependencies.target,
            });
            completions.set(ingress.runId, ingress.finished);
            targets.set(ingress.runId, Object.freeze({
                ...dependencies.target,
                threadTs: ingress.threadTs,
            }));
            return {
                requestId: ingress.requestId,
                runId: ingress.runId,
                requestGroupId: ingress.requestGroupId,
                targetFingerprint,
            };
        },
        async observeTerminal(input) {
            const completion = completions.get(input.started.runId);
            const target = targets.get(input.started.runId);
            try {
                const observed = await observeLiveSmokeTerminal({
                    started: input.started,
                    completion,
                    observabilityRepository: dependencies.observabilityRepository,
                    listTopologyRunsForRootRun: dependencies.listTopologyRunsForRootRun,
                    timeoutMs,
                    ...(input.signal ? { signal: input.signal } : {}),
                    completionRejection: "throw",
                });
                if (!observed.run || !target) {
                    return {
                        ...observed.projection,
                        targetFingerprint,
                        providerDeliveryReceipted: false,
                        targetMatched: false,
                        userReportDelivered: false,
                    };
                }
                return {
                    ...observed.projection,
                    targetFingerprint,
                    ...dependencies.readEvidence(observed.run, target),
                };
            }
            finally {
                completions.delete(input.started.runId);
                targets.delete(input.started.runId);
            }
        },
    };
}
//# sourceMappingURL=slack-live-smoke-runtime.js.map