import type { WebRetrievalMethod } from "./web-retrieval.js";
export type WebResearchExecutionState = "started" | "succeeded" | "failed" | "cancelled";
export interface WebResearchExecutionEvent {
    readonly sequence: number;
    readonly eventId: string;
    readonly runId: string;
    readonly actionReceiptId: string;
    readonly method: WebRetrievalMethod;
    readonly strategyFingerprint: `sha256:${string}`;
    readonly state: WebResearchExecutionState;
    readonly evidenceRefs: readonly string[];
    readonly recordedAt: number;
}
export type WebResearchExecutionEventInput = Omit<WebResearchExecutionEvent, "sequence">;
export interface WebResearchExecutionLedger {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly events: readonly WebResearchExecutionEvent[];
}
export type WebResearchExecutionAppendReason = "web_execution_event_invalid" | "web_execution_run_mismatch" | "web_execution_event_duplicate" | "web_execution_action_duplicate" | "web_execution_transition_invalid" | "web_execution_scope_mismatch";
export type WebResearchExecutionAppendResult = Readonly<{
    ok: true;
    ledger: WebResearchExecutionLedger;
}> | Readonly<{
    ok: false;
    reasonCode: WebResearchExecutionAppendReason;
}>;
export type WebResearchEvidenceKind = "search_result" | "document";
export interface WebResearchEvidenceEntry {
    readonly sequence: number;
    readonly entryId: string;
    readonly runId: string;
    readonly evidenceRef: string;
    readonly kind: WebResearchEvidenceKind;
    readonly method: WebRetrievalMethod;
    readonly parentActionReceiptId: string;
    readonly provenanceRef: string;
    readonly parentEvidenceRefs: readonly string[];
}
export type WebResearchEvidenceEntryInput = Omit<WebResearchEvidenceEntry, "sequence">;
export interface WebResearchEvidenceLedger {
    readonly schemaVersion: 1;
    readonly runId: string;
    readonly entries: readonly WebResearchEvidenceEntry[];
}
export type WebResearchEvidenceAppendReason = "web_evidence_entry_invalid" | "web_evidence_run_mismatch" | "web_evidence_entry_duplicate" | "web_evidence_ref_duplicate" | "web_evidence_action_not_succeeded" | "web_evidence_parent_missing";
export type WebResearchEvidenceAppendResult = Readonly<{
    ok: true;
    ledger: WebResearchEvidenceLedger;
}> | Readonly<{
    ok: false;
    reasonCode: WebResearchEvidenceAppendReason;
}>;
export declare function createWebResearchExecutionLedger(runId: string): WebResearchExecutionLedger;
export declare function appendWebResearchExecutionEvent(input: {
    ledger: WebResearchExecutionLedger;
    event: WebResearchExecutionEventInput;
}): WebResearchExecutionAppendResult;
export declare function createWebResearchEvidenceLedger(runId: string): WebResearchEvidenceLedger;
export declare function appendWebResearchEvidence(input: {
    ledger: WebResearchEvidenceLedger;
    executionLedger: WebResearchExecutionLedger;
    entry: WebResearchEvidenceEntryInput;
}): WebResearchEvidenceAppendResult;
export declare function projectAttemptedWebResearchMethods(ledger: WebResearchExecutionLedger): WebRetrievalMethod[];
//# sourceMappingURL=web-research-ledger.d.ts.map