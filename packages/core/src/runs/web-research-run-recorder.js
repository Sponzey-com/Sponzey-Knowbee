import { appendWebResearchEvidence, appendWebResearchExecutionEvent, createWebResearchEvidenceLedger, createWebResearchExecutionLedger, projectAttemptedWebResearchMethods, } from "../contracts/web-research-ledger.js";
import { createWebRetrievalMachine, transitionWebRetrieval, } from "./web-retrieval-state-machine.js";
export const WEB_RESEARCH_RUN_TRACE_POLICY_VERSION = "web-research-trace-v1";
function record(value) {
    return value && typeof value === "object" && !Array.isArray(value)
        ? value
        : null;
}
function provenanceRef(evidenceRef) {
    return `provenance:${evidenceRef}`;
}
export function admitPersistedWebResearchRunTrace(value) {
    const trace = record(value);
    if (!trace) {
        return Object.freeze({ ok: false, reasonCode: "web_research_trace_invalid" });
    }
    if (trace.schemaVersion !== 1) {
        return Object.freeze({
            ok: false,
            reasonCode: "web_research_trace_schema_unsupported",
        });
    }
    if (trace.policyVersion !== WEB_RESEARCH_RUN_TRACE_POLICY_VERSION) {
        return Object.freeze({
            ok: false,
            reasonCode: "web_research_trace_policy_unsupported",
        });
    }
    const runId = typeof trace.runId === "string" ? trace.runId.trim() : "";
    const machine = record(trace.machine);
    const executionLedger = record(trace.executionLedger);
    const evidenceLedger = record(trace.evidenceLedger);
    if (!runId ||
        !machine ||
        typeof machine.state !== "string" ||
        !executionLedger ||
        executionLedger.schemaVersion !== 1 ||
        executionLedger.runId !== runId ||
        !Array.isArray(executionLedger.events) ||
        !evidenceLedger ||
        evidenceLedger.schemaVersion !== 1 ||
        evidenceLedger.runId !== runId ||
        !Array.isArray(evidenceLedger.entries) ||
        !Array.isArray(trace.attemptedMethods)) {
        return Object.freeze({ ok: false, reasonCode: "web_research_trace_invalid" });
    }
    return Object.freeze({
        ok: true,
        trace: value,
    });
}
export function projectWebResearchRecordedEvidence(input) {
    if (!input.result.success)
        return Object.freeze([]);
    const details = record(input.result.details);
    if (!details)
        return Object.freeze([]);
    if (input.toolName === "web_search") {
        if (!Array.isArray(details.results))
            return Object.freeze([]);
        return Object.freeze(details.results.flatMap((item) => {
            const result = record(item);
            const evidenceRef = typeof result?.evidenceRef === "string"
                ? result.evidenceRef.trim()
                : "";
            return evidenceRef
                ? [Object.freeze({
                        evidenceRef,
                        kind: "search_result",
                        provenanceRef: provenanceRef(evidenceRef),
                        parentEvidenceRefs: Object.freeze([]),
                    })]
                : [];
        }));
    }
    const document = record(details.document);
    const evidenceRef = typeof document?.evidenceRef === "string"
        ? document.evidenceRef.trim()
        : "";
    return Object.freeze(evidenceRef
        ? [Object.freeze({
                evidenceRef,
                kind: "document",
                provenanceRef: provenanceRef(evidenceRef),
                parentEvidenceRefs: Object.freeze([...(input.parentEvidenceRefs ?? [])]),
            })]
        : []);
}
function actionEvents(method) {
    return method === "fast_text_search" || method === "browser_search"
        ? {
            planned: "search_planned",
            started: "search_started",
            succeeded: "search_succeeded",
            failed: "search_failed",
        }
        : {
            planned: "fetch_planned",
            started: "fetch_started",
            succeeded: "fetch_succeeded",
            failed: "fetch_failed",
        };
}
export function createWebResearchRunRecorder(input) {
    const now = input.now ?? Date.now;
    let machine = createWebRetrievalMachine();
    let executionLedger = createWebResearchExecutionLedger(input.runId);
    let evidenceLedger = createWebResearchEvidenceLedger(input.runId);
    let eventSequence = 0;
    const snapshot = () => Object.freeze({
        schemaVersion: 1,
        policyVersion: WEB_RESEARCH_RUN_TRACE_POLICY_VERSION,
        runId: input.runId,
        machine,
        executionLedger,
        evidenceLedger,
        attemptedMethods: Object.freeze(projectAttemptedWebResearchMethods(executionLedger)),
    });
    const rejected = (reasonCode) => Object.freeze({ ok: false, reasonCode });
    return Object.freeze({
        startAction(action) {
            const events = actionEvents(action.method);
            const planned = transitionWebRetrieval(machine, {
                type: events.planned,
                attemptFingerprint: action.strategyFingerprint,
            });
            if (!planned.ok) {
                return rejected("web_research_run_transition_rejected");
            }
            const started = transitionWebRetrieval(planned.value, { type: events.started });
            if (!started.ok) {
                return rejected("web_research_run_transition_rejected");
            }
            const nextEventSequence = eventSequence + 1;
            const appended = appendWebResearchExecutionEvent({
                ledger: executionLedger,
                event: {
                    eventId: `web-execution:${input.runId}:${nextEventSequence}:started`,
                    runId: input.runId,
                    actionReceiptId: action.actionReceiptId,
                    method: action.method,
                    strategyFingerprint: action.strategyFingerprint,
                    state: "started",
                    evidenceRefs: [],
                    recordedAt: now(),
                },
            });
            if (!appended.ok) {
                return rejected("web_research_run_execution_rejected");
            }
            machine = started.value;
            executionLedger = appended.ledger;
            eventSequence = nextEventSequence;
            return Object.freeze({ ok: true, trace: snapshot() });
        },
        finishAction(action) {
            const started = executionLedger.events.find((event) => event.actionReceiptId === action.actionReceiptId && event.state === "started");
            if (!started)
                return rejected("web_research_run_action_missing");
            const evidence = action.outcome === "succeeded" ? [...(action.evidence ?? [])] : [];
            if (action.outcome === "succeeded" && evidence.length === 0) {
                return rejected("web_research_run_evidence_rejected");
            }
            const nextEventSequence = eventSequence + 1;
            const appendedExecution = appendWebResearchExecutionEvent({
                ledger: executionLedger,
                event: {
                    eventId: `web-execution:${input.runId}:${nextEventSequence}:${action.outcome}`,
                    runId: input.runId,
                    actionReceiptId: action.actionReceiptId,
                    method: action.method,
                    strategyFingerprint: action.strategyFingerprint,
                    state: action.outcome,
                    evidenceRefs: evidence.map((item) => item.evidenceRef),
                    recordedAt: now(),
                },
            });
            if (!appendedExecution.ok) {
                return rejected("web_research_run_execution_rejected");
            }
            let nextEvidenceLedger = evidenceLedger;
            if (action.outcome === "succeeded") {
                for (const item of evidence) {
                    const result = appendWebResearchEvidence({
                        ledger: nextEvidenceLedger,
                        executionLedger: appendedExecution.ledger,
                        entry: {
                            entryId: `web-evidence:${input.runId}:${nextEvidenceLedger.entries.length + 1}`,
                            runId: input.runId,
                            evidenceRef: item.evidenceRef,
                            kind: item.kind,
                            method: action.method,
                            parentActionReceiptId: action.actionReceiptId,
                            provenanceRef: item.provenanceRef,
                            parentEvidenceRefs: item.parentEvidenceRefs,
                        },
                    });
                    if (!result.ok)
                        return rejected("web_research_run_evidence_rejected");
                    nextEvidenceLedger = result.ledger;
                }
            }
            const events = actionEvents(action.method);
            const transitionEvent = action.outcome === "succeeded"
                ? { type: events.succeeded }
                : action.outcome === "cancelled"
                    ? { type: "cancelled" }
                    : {
                        type: events.failed,
                        reasonCode: action.reasonCode?.trim() || "web_research_action_failed",
                    };
            const transitioned = transitionWebRetrieval(machine, transitionEvent);
            if (!transitioned.ok)
                return rejected("web_research_run_transition_rejected");
            machine = transitioned.value;
            executionLedger = appendedExecution.ledger;
            evidenceLedger = nextEvidenceLedger;
            eventSequence = nextEventSequence;
            return Object.freeze({ ok: true, trace: snapshot() });
        },
        startVerification() {
            const transitioned = transitionWebRetrieval(machine, { type: "verification_started" });
            if (!transitioned.ok)
                return rejected("web_research_run_transition_rejected");
            machine = transitioned.value;
            return Object.freeze({ ok: true, trace: snapshot() });
        },
        finishVerification(result) {
            const event = result.outcome === "succeeded"
                ? { type: "verification_completed" }
                : result.outcome === "cancelled"
                    ? { type: "cancelled" }
                    : {
                        type: "verification_failed",
                        reasonCode: result.reasonCode?.trim() || "web_evidence_verification_failed",
                    };
            const transitioned = transitionWebRetrieval(machine, event);
            if (!transitioned.ok)
                return rejected("web_research_run_transition_rejected");
            machine = transitioned.value;
            return Object.freeze({ ok: true, trace: snapshot() });
        },
        snapshot,
    });
}
//# sourceMappingURL=web-research-run-recorder.js.map