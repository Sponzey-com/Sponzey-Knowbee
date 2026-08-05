import { REQUIRED_REPRESENTATIVE_FLOW_IDS, buildMeasuredRepresentativeFlowSample, } from "./performance-baseline.js";
export function collectLivePerformanceEvidence(input) {
    if (!REQUIRED_REPRESENTATIVE_FLOW_IDS.includes(input.flowId)) {
        return { status: "rejected", reasonCode: "flow_unsupported" };
    }
    const loaded = input.source.read(input.runId);
    if (loaded.status === "rejected")
        return loaded;
    if (loaded.records.run.status !== "completed") {
        return { status: "rejected", reasonCode: "run_not_completed" };
    }
    const orderedTransitions = [...loaded.records.queueTransitions].sort((left, right) => left.sequence - right.sequence);
    const queuedAtByKey = new Map();
    let queueWaitMs = 0;
    for (const transition of orderedTransitions) {
        if (transition.eventKind !== "queued" && transition.eventKind !== "running")
            continue;
        if (!transition.recoveryKey) {
            if (transition.eventKind === "queued") {
                return { status: "rejected", reasonCode: "queue_transition_key_missing" };
            }
            continue;
        }
        const key = `${transition.queueName}:${transition.recoveryKey}`;
        if (transition.eventKind === "queued") {
            const pending = queuedAtByKey.get(key) ?? [];
            pending.push(transition.at);
            queuedAtByKey.set(key, pending);
            continue;
        }
        const pending = queuedAtByKey.get(key);
        if (!pending || pending.length === 0)
            continue;
        const queuedAt = pending.shift();
        if (queuedAt === undefined)
            continue;
        if (transition.at < queuedAt) {
            return { status: "rejected", reasonCode: "queue_transition_reversed" };
        }
        queueWaitMs += transition.at - queuedAt;
    }
    if ([...queuedAtByKey.values()].some((pending) => pending.length > 0)) {
        return { status: "rejected", reasonCode: "queue_transition_unpaired" };
    }
    const records = loaded.records;
    return {
        status: "ready",
        sample: buildMeasuredRepresentativeFlowSample({
            flowId: input.flowId,
            sampleId: `run:${input.runId}`,
            startedAt: records.run.startedAt,
            finishedAt: records.run.finishedAt,
            llmReceipts: records.llmReceipts,
            costEstimateUsd: null,
            attemptCount: records.events.filter((event) => event.eventKind === "typed_observability:execution_started").length,
            queueWaitMs,
            eventBytes: records.events.reduce((sum, event) => sum + event.payloadBytes, 0),
            evidenceBytes: records.events
                .filter((event) => event.eventKind === "typed_observability:evidence_recorded")
                .reduce((sum, event) => sum + event.payloadBytes, 0),
        }),
    };
}
//# sourceMappingURL=live-performance-evidence.js.map