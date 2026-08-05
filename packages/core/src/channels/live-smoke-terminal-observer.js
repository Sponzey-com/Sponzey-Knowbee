import { projectTypedObservabilityTrace } from "../observability/typed-event-contract.js";
export const DEFAULT_LIVE_SMOKE_TERMINAL_TIMEOUT_MS = 240_000;
export async function observeLiveSmokeTerminal(input) {
    if (!input.completion) {
        return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") };
    }
    let timeoutHandle;
    let abortHandler;
    try {
        const timeout = new Promise((resolve) => {
            timeoutHandle = setTimeout(() => resolve({ status: "timed_out" }), input.timeoutMs);
        });
        const aborted = new Promise((resolve) => {
            if (!input.signal)
                return;
            abortHandler = () => resolve({ status: "aborted" });
            if (input.signal.aborted)
                abortHandler();
            else
                input.signal.addEventListener("abort", abortHandler, { once: true });
        });
        const waited = await Promise.race([
            input.completion.then((run) => ({ status: "resolved", run }), (error) => ({ status: "rejected", error })),
            timeout,
            aborted,
        ]);
        if (waited.status === "timed_out") {
            return { projection: unavailableLiveSmokeTerminal(input.started, "timed_out") };
        }
        if (waited.status === "aborted") {
            return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") };
        }
        if (waited.status === "rejected") {
            if (input.completionRejection === "throw")
                throw waited.error;
            return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") };
        }
        if (!waited.run) {
            return { projection: unavailableLiveSmokeTerminal(input.started, "interrupted") };
        }
        const run = waited.run;
        const snapshot = input.observabilityRepository.list({
            requestId: run.id,
            requestGroupId: run.requestGroupId,
            rootRunId: run.lineageRootRunId,
            runId: run.id,
            limit: 500,
        });
        const trace = projectTypedObservabilityTrace(snapshot.events);
        const finalization = [...trace.events]
            .reverse()
            .find((event) => event.kind === "finalization_completed");
        const finalAnswerCount = trace.events.filter((event) => event.kind === "finalization_completed").length;
        const executionOutcome = input.readExecutionOutcome?.(run.id);
        const decisionReceiptRefs = input.readDecisionReceiptRefs?.(run.id, run.requestGroupId) ?? { decisionReceiptOrderValid: false };
        const completedAt = (input.now ?? Date.now)();
        const firstResponseLatency = input.readFirstResponseLatency?.(run.id, run.requestGroupId);
        const latencyEvidence = firstResponseLatency && input.startedAt !== undefined
            ? {
                ...firstResponseLatency,
                terminalResponseLatencyMs: Math.max(0, completedAt - input.startedAt),
                completedAt,
            }
            : undefined;
        return {
            run,
            projection: {
                requestId: run.id,
                runId: run.id,
                requestGroupId: run.requestGroupId,
                terminalStatus: terminalStatus(run),
                typedTraceStatus: snapshot.events.length > 0 ? "ready" : "not_recorded",
                typedTraceTerminal: trace.terminal,
                typedTraceIssueCount: snapshot.issues.length + trace.issues.length,
                analysisCompleted: trace.events.some((event) => event.kind === "analysis_completed"),
                evidenceRecorded: trace.events.some((event) => event.kind === "evidence_recorded"),
                reviewCompleted: trace.events.some((event) => event.kind === "review_completed"),
                finalizationCompleted: finalization !== undefined,
                rootOwnerFinalized: run.runScope === "root" && finalAnswerCount === 1,
                finalAnswerCount,
                topologyRunCount: input.listTopologyRunsForRootRun(run.id).length,
                ...(finalization ? { auditEventId: finalization.eventId } : {}),
                ...(executionOutcome ? { executionOutcome } : {}),
                ...(latencyEvidence ? { latencyEvidence } : {}),
                ...decisionReceiptRefs,
                resultReviewReasonCodes: trace.events
                    .filter((event) => event.kind === "review_completed")
                    .map((event) => event.reasonCode),
            },
        };
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
        if (input.signal && abortHandler)
            input.signal.removeEventListener("abort", abortHandler);
    }
}
function terminalStatus(run) {
    const status = run.status;
    return status === "completed" ||
        status === "failed" ||
        status === "cancelled" ||
        status === "interrupted"
        ? status
        : "interrupted";
}
export function unavailableLiveSmokeTerminal(started, status) {
    return {
        ...started,
        terminalStatus: status,
        typedTraceStatus: "unavailable",
        typedTraceTerminal: false,
        typedTraceIssueCount: 1,
        analysisCompleted: false,
        evidenceRecorded: false,
        reviewCompleted: false,
        finalizationCompleted: false,
        rootOwnerFinalized: false,
        finalAnswerCount: 0,
        topologyRunCount: 0,
        decisionReceiptOrderValid: false,
        resultReviewReasonCodes: [],
    };
}
//# sourceMappingURL=live-smoke-terminal-observer.js.map