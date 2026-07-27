import { type LlmCapabilitySelectionRejectionCode, type LlmCapabilitySelectionValidationCode } from "./llm-capability-selection.js";
export declare const CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION: "knowbee.capability-selection-trace.v1";
export type CapabilitySelectionTraceValidationCode = LlmCapabilitySelectionValidationCode | "invalid_json" | "json_object_required";
export type CapabilitySelectionTraceTerminalStatus = "allowed" | "approval_required" | "rejected" | "failed" | "cancelled";
export type CapabilitySelectionTraceReasonCode = "capability_selection_allowed" | "capability_selection_approval_required" | "capability_selection_rejected" | "capability_selection_context_invalid" | "capability_selection_provider_failed" | "capability_selection_timed_out" | "capability_selection_output_limit_exceeded" | "capability_selection_invalid_output" | "capability_selection_cancelled";
export interface CapabilitySelectionDecisionTraceDetail {
    schemaVersion: typeof CAPABILITY_SELECTION_DECISION_TRACE_SCHEMA_VERSION;
    terminalStatus: CapabilitySelectionTraceTerminalStatus;
    attemptCount: 0 | 1 | 2;
    attemptKinds: Array<"initial" | "repair">;
    validationReasonCodes: CapabilitySelectionTraceValidationCode[];
    admissionReasonCodes: LlmCapabilitySelectionRejectionCode[];
    strategyFingerprints: string[];
}
export type CapabilitySelectionDecisionTraceParseResult = {
    status: "ready";
    detail: CapabilitySelectionDecisionTraceDetail;
} | {
    status: "rejected";
    reasonCode: "schema_version_unsupported" | "unknown_field" | "terminal_status_invalid" | "attempt_contract_invalid" | "validation_reason_invalid" | "admission_reason_invalid" | "strategy_fingerprint_invalid";
};
export interface CapabilitySelectionDecisionTraceRecordInput {
    runId: string;
    decisionReceiptId: string;
    reasonCode: CapabilitySelectionTraceReasonCode;
    detail: Omit<CapabilitySelectionDecisionTraceDetail, "schemaVersion">;
}
export type CapabilitySelectionDecisionTraceRecordResult = {
    status: "stored";
    traceId: string;
} | {
    status: "failed";
    reasonCode: "trace_detail_invalid" | "trace_storage_failed";
};
export interface CapabilitySelectionDecisionTraceSink {
    record(input: CapabilitySelectionDecisionTraceRecordInput): CapabilitySelectionDecisionTraceRecordResult;
}
export declare function parseCapabilitySelectionDecisionTraceDetail(value: unknown): CapabilitySelectionDecisionTraceParseResult;
//# sourceMappingURL=capability-selection-decision-trace.d.ts.map