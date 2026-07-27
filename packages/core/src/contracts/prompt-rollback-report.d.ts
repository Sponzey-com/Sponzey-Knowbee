import type { PromptRollbackRestorationReceipt } from "./prompt-rollback-execution.js";
export type PromptRollbackReportDecision = {
    status: "authorized";
    rolledBackFiles: string[];
    reason: string;
    restoredChecksum: string;
    activationStateAfterRollback: "rolled_back";
    remainingRisk: string;
    nextRecommendedAction: string;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "rollback_restoration_invalid" | "rolled_back_files_missing" | "rollback_reason_missing" | "activation_state_invalid" | "remaining_risk_missing" | "next_action_missing" | "rollback_report_lineage_mismatch";
};
export declare function authorizePromptRollbackReport(input: {
    restoration: PromptRollbackRestorationReceipt;
    rolledBackFiles: string[];
    reason: string;
    activationStateAfterRollback: string;
    remainingRisk: string;
    nextRecommendedAction: string;
}): PromptRollbackReportDecision;
export declare function publishAuthorizedPromptRollbackReport<T>(input: {
    decision: PromptRollbackReportDecision;
    renderWithLlm: (facts: Extract<PromptRollbackReportDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "reported";
    text: T;
} | Extract<PromptRollbackReportDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-rollback-report.d.ts.map