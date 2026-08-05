export declare const DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS: readonly ["reload", "restart", "prompt_version_activation"];
export declare const PROMPT_IMPROVEMENT_REPORT_STATES: readonly ["written", "validated", "activation_pending", "activated", "rolled_back"];
export type DocumentedPromptRuntimeActivationMethod = typeof DOCUMENTED_PROMPT_RUNTIME_ACTIVATION_METHODS[number];
export type PromptImprovementReportState = typeof PROMPT_IMPROVEMENT_REPORT_STATES[number];
export type PromptImprovementReportReceiptKind = "source_written" | "validation_passed" | "activation_scheduled" | "activation_confirmed" | "rollback_verified";
export interface PromptImprovementRuntimeContext {
    readonly schemaVersion: 1;
    readonly runtimeSnapshotId: string;
    readonly capturedAt: number;
    readonly promptSourceRoot: string;
    readonly promptRegistryHandleId: string;
    readonly activeConversationId: string;
    readonly activePromptSetFingerprint: string;
    readonly promptSourceRefs: readonly string[];
}
export interface PromptImprovementReportReceipt {
    schemaVersion: 1;
    kind: PromptImprovementReportReceiptKind;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    evidenceRef: string;
}
export type PromptImprovementRuntimeContextDecision = {
    status: "bound";
    context: PromptImprovementRuntimeContext;
} | {
    status: "blocked";
    reasonCode: "startup_context_invalid" | "prompt_source_root_invalid" | "prompt_source_refs_invalid";
};
export type PromptRuntimeActivationDecision = {
    status: "authorized";
    reportState: "activation_pending";
    activation: {
        method: DocumentedPromptRuntimeActivationMethod;
        activationRunId: string;
        nextRuntimeSnapshotId: string;
        nextPromptSetFingerprint: string;
    };
    currentConversation: {
        conversationId: string;
        promptSetFingerprint: string;
        unchanged: true;
    };
} | {
    status: "blocked";
    reasonCode: "activation_input_invalid" | "activation_method_invalid" | "startup_context_mismatch" | "current_run_mutation" | "current_snapshot_mutation" | "current_prompt_set_mutation";
};
export type PromptImprovementReportTransitionDecision = {
    status: "authorized";
    previousState: PromptImprovementReportState | undefined;
    nextState: PromptImprovementReportState;
    evidenceRef: string;
} | {
    status: "blocked";
    reasonCode: "report_receipt_invalid" | "report_lineage_mismatch" | "report_transition_invalid";
};
export declare function bindPromptImprovementRuntimeContext(input: PromptImprovementRuntimeContext): PromptImprovementRuntimeContextDecision;
export declare function authorizePromptRuntimeActivation(input: {
    context: PromptImprovementRuntimeContext;
    proposalRunId: string;
    activationRunId: string;
    observedRuntimeSnapshotId: string;
    nextRuntimeSnapshotId: string;
    observedActivePromptSetFingerprint: string;
    nextPromptSetFingerprint: string;
    method: DocumentedPromptRuntimeActivationMethod;
}): PromptRuntimeActivationDecision;
export declare function authorizePromptImprovementReportTransition(input: {
    currentState: PromptImprovementReportState | undefined;
    receipt: PromptImprovementReportReceipt;
    expectedProposalFingerprint: string;
    expectedSourceSetFingerprint: string;
}): PromptImprovementReportTransitionDecision;
//# sourceMappingURL=prompt-improvement-runtime-context.d.ts.map