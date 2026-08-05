import { type WebResearchEvidenceKind, type WebResearchEvidenceLedger, type WebResearchExecutionLedger } from "../contracts/web-research-ledger.js";
import type { WebResearchFingerprint } from "../contracts/web-research-method.js";
import type { WebRetrievalMethod } from "../contracts/web-retrieval.js";
import type { ToolResult } from "../tools/types.js";
import { type WebRetrievalMachine } from "./web-retrieval-state-machine.js";
export declare const WEB_RESEARCH_RUN_TRACE_POLICY_VERSION = "web-research-trace-v1";
export interface WebResearchRecordedEvidence {
    readonly evidenceRef: string;
    readonly kind: WebResearchEvidenceKind;
    readonly provenanceRef: string;
    readonly parentEvidenceRefs: readonly string[];
}
export interface WebResearchRunTrace {
    readonly schemaVersion: 1;
    readonly policyVersion: typeof WEB_RESEARCH_RUN_TRACE_POLICY_VERSION;
    readonly runId: string;
    readonly machine: WebRetrievalMachine;
    readonly executionLedger: WebResearchExecutionLedger;
    readonly evidenceLedger: WebResearchEvidenceLedger;
    readonly attemptedMethods: readonly WebRetrievalMethod[];
}
export type PersistedWebResearchRunTraceAdmission = Readonly<{
    ok: true;
    trace: WebResearchRunTrace;
}> | Readonly<{
    ok: false;
    reasonCode: "web_research_trace_invalid" | "web_research_trace_schema_unsupported" | "web_research_trace_policy_unsupported";
}>;
export type WebResearchRunRecordResult = Readonly<{
    ok: true;
    trace: WebResearchRunTrace;
}> | Readonly<{
    ok: false;
    reasonCode: "web_research_run_transition_rejected" | "web_research_run_execution_rejected" | "web_research_run_evidence_rejected" | "web_research_run_action_missing";
}>;
export interface WebResearchRunRecorder {
    startAction(input: Readonly<{
        actionReceiptId: string;
        method: WebRetrievalMethod;
        strategyFingerprint: WebResearchFingerprint;
    }>): WebResearchRunRecordResult;
    finishAction(input: Readonly<{
        actionReceiptId: string;
        method: WebRetrievalMethod;
        strategyFingerprint: WebResearchFingerprint;
        outcome: "succeeded" | "failed" | "cancelled";
        reasonCode?: string;
        evidence?: readonly WebResearchRecordedEvidence[];
    }>): WebResearchRunRecordResult;
    startVerification(): WebResearchRunRecordResult;
    finishVerification(input: Readonly<{
        outcome: "succeeded" | "failed" | "cancelled";
        reasonCode?: string;
    }>): WebResearchRunRecordResult;
    snapshot(): WebResearchRunTrace;
}
export declare function admitPersistedWebResearchRunTrace(value: unknown): PersistedWebResearchRunTraceAdmission;
export declare function projectWebResearchRecordedEvidence(input: Readonly<{
    toolName: "web_search" | "web_fetch";
    result: ToolResult;
    parentEvidenceRefs?: readonly string[];
}>): readonly WebResearchRecordedEvidence[];
export declare function createWebResearchRunRecorder(input: Readonly<{
    runId: string;
    now?: () => number;
}>): WebResearchRunRecorder;
//# sourceMappingURL=web-research-run-recorder.d.ts.map