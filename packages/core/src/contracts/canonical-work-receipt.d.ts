import type { CanonicalWorkEvent } from "./canonical-work-state.js";
export declare const CANONICAL_WORK_RECEIPT_KINDS: readonly ["diagnosis", "analysis_revision", "policy", "execution", "attempt", "verification", "recovery", "input_requirement", "user_input", "exhaustion", "cancellation", "delivery", "blocker", "approval"];
export type CanonicalWorkReceiptKind = typeof CANONICAL_WORK_RECEIPT_KINDS[number];
export declare const CANONICAL_EVENT_RECEIPT_KINDS: Readonly<Record<CanonicalWorkEvent, CanonicalWorkReceiptKind>>;
export declare const CANONICAL_TERMINAL_CAUSE_ORIGIN_STAGES: readonly ["ingress", "runtime_configuration", "request_diagnosis", "solution_plan", "policy_admission", "execution", "result_diagnosis", "final_response_rendering", "delivery", "recovery"];
export type CanonicalTerminalCauseOriginStage = typeof CANONICAL_TERMINAL_CAUSE_ORIGIN_STAGES[number];
export declare const CANONICAL_TERMINAL_CAUSE_OUTCOME_KINDS: readonly ["policy_block", "technical_failure", "input_required", "exhausted", "cancelled", "blocked"];
export type CanonicalTerminalCauseOutcomeKind = typeof CANONICAL_TERMINAL_CAUSE_OUTCOME_KINDS[number];
export interface CanonicalTerminalCause {
    schemaVersion: 1;
    originStage: CanonicalTerminalCauseOriginStage;
    outcomeKind: CanonicalTerminalCauseOutcomeKind;
    reasonCode: string;
    safeAlternativesExhausted?: boolean;
}
export interface CanonicalWorkReceipt {
    receiptId: string;
    workId: string;
    kind: CanonicalWorkReceiptKind;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    issuedAt: number;
    consumedRevision?: number;
    terminalCause?: CanonicalTerminalCause;
}
export type CanonicalWorkReceiptValidationReason = "receipt_invalid" | "receipt_scope_mismatch" | "receipt_kind_mismatch" | "receipt_already_consumed";
export declare function validateCanonicalWorkReceipt(receipt: CanonicalWorkReceipt): {
    ok: true;
} | {
    ok: false;
    reasonCode: "receipt_invalid";
};
export declare function validateCanonicalWorkReceiptForEvent(input: {
    receipt: CanonicalWorkReceipt;
    workId: string;
    event: CanonicalWorkEvent;
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: CanonicalWorkReceiptValidationReason;
};
//# sourceMappingURL=canonical-work-receipt.d.ts.map