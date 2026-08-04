import type { CanonicalWorkAggregate, CanonicalWorkTransitionReceipt } from "../contracts/canonical-work-aggregate.js";
import { type CanonicalTerminalCause, type CanonicalWorkReceipt } from "../contracts/canonical-work-receipt.js";
declare const TERMINAL_CAUSE_EVENT_OUTCOMES: Readonly<{
    readonly APPROVAL_DENIED_OR_EXPIRED: "blocked";
    readonly INPUT_REQUIRED: "input_required";
    readonly POLICY_BLOCKED: "policy_block";
    readonly RESULT_BLOCKED: "blocked";
    readonly PATHS_EXHAUSTED: "exhausted";
    readonly USER_CANCELLED: "cancelled";
}>;
type TerminalCauseEvent = keyof typeof TERMINAL_CAUSE_EVENT_OUTCOMES;
export type CanonicalTerminalEvidenceResult = {
    status: "available";
    workId: string;
    rootRunId: string;
    terminalState: Extract<CanonicalWorkTransitionReceipt["nextState"], "USER_INPUT_REQUIRED" | "BLOCKED" | "EXHAUSTED" | "CANCELLED">;
    transition: {
        revision: number;
        event: TerminalCauseEvent;
        receiptRef: string;
    };
    cause: CanonicalTerminalCause;
    evidenceFingerprint: string;
    evidenceRefs: string[];
} | {
    status: "evidence_missing";
    reasonCode: "canonical_terminal_aggregate_missing" | "canonical_terminal_transition_missing" | "canonical_terminal_receipt_missing" | "canonical_terminal_cause_missing";
} | {
    status: "evidence_invalid";
    reasonCode: "canonical_terminal_receipt_corrupt" | "canonical_terminal_receipt_ref_mismatch" | "canonical_terminal_receipt_scope_mismatch" | "canonical_terminal_receipt_kind_mismatch" | "canonical_terminal_receipt_revision_mismatch" | "canonical_terminal_cause_outcome_mismatch";
};
export interface CanonicalTerminalEvidencePort {
    read(workId: string): CanonicalTerminalEvidenceResult;
}
export interface CanonicalTerminalEvidenceDependencies {
    loadAggregate(workId: string): CanonicalWorkAggregate | undefined;
    loadReceipt(receiptId: string): CanonicalWorkReceipt | undefined;
}
export declare function createCanonicalTerminalEvidencePort(dependencies: CanonicalTerminalEvidenceDependencies): CanonicalTerminalEvidencePort;
export {};
//# sourceMappingURL=canonical-terminal-evidence.d.ts.map