export declare const PROMPT_IMPROVEMENT_PLATFORM_IMPACTS: readonly ["platform_policy", "common_safety", "common_tool_policy", "common_yeonjang_policy", "agent_owned_only"];
export type PromptImprovementPlatformImpact = typeof PROMPT_IMPROVEMENT_PLATFORM_IMPACTS[number];
export type PersistentPromptSourceKind = "prompt_source_file" | "persistent_prompt_record" | "harness_source_file";
export type NextRunPromptActivationMethod = "reload" | "restart" | "next_request_snapshot";
export interface PersistentPromptSourceDescriptor {
    sourceKind: PersistentPromptSourceKind;
    sourceRef: string;
    baselineVersion: string;
    baselineChecksum: string;
    proposedVersion: string;
    proposedChecksum: string;
    rollbackRef: string;
}
export interface MainAgentPlatformReviewReceipt {
    schemaVersion: 1;
    reviewId: string;
    mainAgentId: string;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    invariantReviewFingerprint: string;
    decision: "approved" | "denied";
    reviewedAt: number;
    expiresAt: number;
}
export interface PromptSourceApplicationAuthorization {
    schemaVersion: 1;
    status: "source_write_authorized";
    proposalFingerprint: string;
    impact: PromptImprovementPlatformImpact;
    sourceSetFingerprint: string;
    sources: PersistentPromptSourceDescriptor[];
    mainReviewId?: string;
}
export interface VerifiedPromptSourceApplicationReceipt {
    schemaVersion: 1;
    proposalFingerprint: string;
    sourceSetFingerprint: string;
    written: true;
    verified: true;
    testsPassed: string[];
    writtenSourceVersions: Array<{
        sourceRef: string;
        version: string;
        checksum: string;
    }>;
}
export type PromptSourceApplicationDecision = {
    status: "authorized";
    authorization: PromptSourceApplicationAuthorization;
} | {
    status: "blocked";
    reasonCode: "main_review_missing" | "main_review_denied" | "main_review_expired" | "main_review_scope_mismatch" | "source_kind_invalid" | "source_ref_forbidden" | "source_lineage_invalid";
};
export type NextRunPromptActivationDecision = {
    status: "authorized";
    activation: {
        method: NextRunPromptActivationMethod;
        activationRunId: string;
        nextRuntimeSnapshotFingerprint: string;
    };
} | {
    status: "blocked";
    reasonCode: "source_application_unverified" | "source_application_scope_mismatch" | "regression_tests_missing" | "current_run_mutation" | "current_process_snapshot_mutation" | "loaded_source_mismatch";
};
export declare const FORBIDDEN_PROMPT_IMPROVEMENT_SOURCE_PREFIXES: readonly ["memory:", "agent-memory:", "database:", "db:"];
export declare function authorizePromptSourceApplication(input: {
    proposalFingerprint: string;
    impact: PromptImprovementPlatformImpact;
    sourceSetFingerprint: string;
    invariantReviewFingerprint: string;
    configuredMainAgentId: string;
    sources: PersistentPromptSourceDescriptor[];
    mainReview?: MainAgentPlatformReviewReceipt;
    now: number;
}): PromptSourceApplicationDecision;
export declare function writeAuthorizedPromptSources<T>(input: {
    decision: PromptSourceApplicationDecision;
    write: (authorization: PromptSourceApplicationAuthorization) => Promise<T>;
}): Promise<{
    status: "written";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
export declare function authorizeNextRunPromptActivation(input: {
    proposalRunId: string;
    activationRunId: string;
    currentRuntimeSnapshotFingerprint: string;
    nextRuntimeSnapshotFingerprint: string;
    activationMethod: NextRunPromptActivationMethod;
    sourceApplication: VerifiedPromptSourceApplicationReceipt;
    expectedProposalFingerprint: string;
    expectedSourceSetFingerprint: string;
    expectedSources: PersistentPromptSourceDescriptor[];
    requiredTests: string[];
}): NextRunPromptActivationDecision;
export declare function activateAuthorizedPromptSnapshot<T>(input: {
    decision: NextRunPromptActivationDecision;
    activate: (activation: Extract<NextRunPromptActivationDecision, {
        status: "authorized";
    }>["activation"]) => Promise<T>;
}): Promise<{
    status: "activated";
    result: T;
} | {
    status: "blocked";
    reasonCode: string;
}>;
//# sourceMappingURL=platform-prompt-activation-boundary.d.ts.map