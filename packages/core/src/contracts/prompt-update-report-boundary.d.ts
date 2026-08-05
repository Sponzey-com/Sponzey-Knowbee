import type { CompletePromptActivationDecision } from "./complete-prompt-activation.js";
export interface PromptSourceWriteReceipt {
    sourceRef: string;
    sourceVersion: string;
    sourceChecksum: string;
    writtenAt: number;
    evidenceRef: string;
}
export interface PromptSourceValidationFailureReceipt {
    sourceRef: string;
    proposedVersion: string;
    failedCheckIds: string[];
    failedAt: number;
    evidenceRefs: string[];
}
export interface PromptRollbackCompletionReceipt {
    sourceRef: string;
    rolledBackFromVersion: string;
    rolledBackFromChecksum: string;
    restoredVersion: string;
    restoredChecksum: string;
    rolledBackAt: number;
    rollbackSourceRef: string;
    verificationRef: string;
}
export type PromptUpdateReportClaim = "source_updated_activation_pending" | "source_updated_runtime_loaded" | "source_update_validation_failed" | "source_rolled_back_to_baseline";
export type PromptUpdateReportDecision = {
    status: "authorized";
    claimCode: "source_updated_activation_pending";
    sourceRef: string;
    sourceVersion: string;
    activeNow: false;
    evidenceRefs: string[];
} | {
    status: "authorized";
    claimCode: "source_updated_runtime_loaded";
    sourceRef: string;
    sourceVersion: string;
    activeNow: true;
    loaderId: string;
    activatedAt: number;
    activationMethod: string;
    evidenceRefs: string[];
} | {
    status: "authorized";
    claimCode: "source_update_validation_failed";
    sourceRef: string;
    proposedVersion: string;
    activeNow: false;
    failedCheckIds: string[];
    evidenceRefs: string[];
} | {
    status: "authorized";
    claimCode: "source_rolled_back_to_baseline";
    sourceRef: string;
    rolledBackFromVersion: string;
    restoredVersion: string;
    restoredChecksum: string;
    activeNow: false;
    rollbackSourceRef: string;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "generic_update_claim_forbidden" | "source_write_evidence_invalid" | "activation_evidence_missing" | "activation_lineage_mismatch" | "activation_time_invalid" | "report_state_mismatch" | "validation_failure_evidence_invalid" | "rollback_evidence_invalid" | "rollback_target_invalid" | "rollback_lineage_mismatch" | "rollback_time_invalid";
};
export declare function authorizePromptUpdateReport(input: {
    requestedClaim: string;
    write?: PromptSourceWriteReceipt;
    activation?: CompletePromptActivationDecision;
    validationFailure?: PromptSourceValidationFailureReceipt;
    rollback?: PromptRollbackCompletionReceipt;
}): PromptUpdateReportDecision;
export declare function publishAuthorizedPromptUpdateReport<T>(input: {
    decision: PromptUpdateReportDecision;
    renderWithLlm: (facts: Extract<PromptUpdateReportDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "reported";
    text: T;
} | Extract<PromptUpdateReportDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-update-report-boundary.d.ts.map