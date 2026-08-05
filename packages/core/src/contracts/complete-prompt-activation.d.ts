import type { PromptActivationEvidenceDecision } from "./prompt-activation-evidence.js";
export interface PreActivationTestReceipt {
    testId: string;
    status: "passed" | "failed";
    sourceRef: string;
    sourceVersion: string;
    sourceChecksum: string;
    executedAt: number;
    evidenceRef: string;
}
export type PreActivationTestDecision = {
    status: "authorized";
    testIds: string[];
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "activation_test_invalid" | "activation_test_missing" | "activation_test_failed" | "activation_test_lineage_mismatch" | "activation_test_time_invalid";
};
export type PromptRollbackEvidenceDecision = {
    status: "authorized";
    sourceRef: string;
    targetVersion: string;
    targetChecksum: string;
    rollbackSourceRef: string;
    verificationRef: string;
} | {
    status: "blocked";
    reasonCode: string;
};
export type CompletePromptActivationDecision = {
    status: "authorized";
    activationId: string;
    sourceRef: string;
    sourceVersion: string;
    loaderId: string;
    activatedAt: number;
    method: string;
    testIds: string[];
    rollbackSourceRef: string;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "activation_evidence_blocked" | "activation_tests_blocked" | "rollback_evidence_blocked" | "rollback_target_invalid";
};
export declare function authorizePreActivationTests(input: {
    requiredTestIds: readonly string[];
    receipts: readonly PreActivationTestReceipt[];
    sourceRef: string;
    sourceVersion: string;
    sourceChecksum: string;
    sourceWrittenAt: number;
    activatedAt: number;
}): PreActivationTestDecision;
export declare function authorizeCompletePromptActivation(input: {
    activation: PromptActivationEvidenceDecision;
    tests: PreActivationTestDecision;
    rollback: PromptRollbackEvidenceDecision;
}): CompletePromptActivationDecision;
export declare function publishCompletePromptActivation<T>(input: {
    decision: CompletePromptActivationDecision;
    publish: (authorization: Extract<CompletePromptActivationDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "published";
    result: T;
} | Extract<CompletePromptActivationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=complete-prompt-activation.d.ts.map