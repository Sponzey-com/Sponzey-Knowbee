import type { PromptChangeLineage, PromptChangeRollbackReadinessDecision } from "./prompt-change-rollback-readiness.js";
export declare const PROMPT_ROLLBACK_TRIGGER_KINDS: readonly ["tests_failed_after_write", "invariant_violation_after_apply", "wrong_prompt_version_activated", "user_or_admin_requested", "changed_source_missing_corrupt_or_unsafe"];
export type PromptRollbackTriggerKind = typeof PROMPT_ROLLBACK_TRIGGER_KINDS[number];
interface PromptRollbackTriggerBase {
    sourceRef: string;
    sourceVersion: string;
    sourceChecksum: string;
    observedAt: number;
    evidenceRef: string;
}
export type PromptRollbackTriggerReceipt = PromptRollbackTriggerBase & ({
    kind: "tests_failed_after_write";
    failedTestIds: string[];
} | {
    kind: "invariant_violation_after_apply";
    invariantIds: string[];
} | {
    kind: "wrong_prompt_version_activated";
    expectedVersion: string;
    loadedVersion: string;
} | {
    kind: "user_or_admin_requested";
    requestedByType: "user" | "admin";
    requestedByRef: string;
} | {
    kind: "changed_source_missing_corrupt_or_unsafe";
    health: "missing" | "corrupt" | "unsafe";
});
export type PromptRollbackTriggerDecision = {
    status: "authorized";
    kind: PromptRollbackTriggerKind;
    sourceRef: string;
    sourceVersion: string;
    observedAt: number;
    evidenceRef: string;
} | {
    status: "blocked";
    reasonCode: "source_write_missing" | "rollback_trigger_lineage_mismatch" | "rollback_trigger_time_invalid" | "rollback_trigger_evidence_invalid";
};
export type PromptRollbackExecutionResult = {
    status: "restored";
    sourceRef: string;
    version: string;
    checksum: string;
    executionRef: string;
} | {
    status: "failed";
    reasonRef: string;
};
export interface PromptRollbackRestorationReceipt {
    sourceRef: string;
    restoredVersion: string;
    restoredChecksum: string;
    triggerKind: PromptRollbackTriggerKind;
    triggerEvidenceRef: string;
    readinessEvidenceRef: string;
    executionRef: string;
    verificationRef: string;
}
export declare function authorizePromptRollbackTrigger(input: {
    change: PromptChangeLineage;
    sourceWrittenAt: number;
    receipt: PromptRollbackTriggerReceipt;
}): PromptRollbackTriggerDecision;
export declare function executeAuthorizedPromptRollback<T>(input: {
    trigger: PromptRollbackTriggerDecision;
    readiness: PromptChangeRollbackReadinessDecision;
    execute: (readiness: Extract<PromptChangeRollbackReadinessDecision, {
        status: "authorized";
    }>) => Promise<PromptRollbackExecutionResult>;
    verify: (restoration: Extract<PromptRollbackExecutionResult, {
        status: "restored";
    }>) => Promise<{
        verified: boolean;
        verificationRef: string;
    }>;
    complete: (receipt: PromptRollbackRestorationReceipt) => Promise<T>;
}): Promise<{
    status: "rolled_back";
    result: T;
    restoredVersion: string;
    restoredChecksum: string;
} | {
    status: "blocked";
    reasonCode: "rollback_trigger_blocked" | "rollback_readiness_missing" | "execution_failed" | "restored_lineage_mismatch" | "restoration_verification_failed";
}>;
export {};
//# sourceMappingURL=prompt-rollback-execution.d.ts.map