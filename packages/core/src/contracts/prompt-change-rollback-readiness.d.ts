import { type PromptImprovementRollbackSourceType } from "./prompt-rollback-source-policy.js";
export { PROMPT_ROLLBACK_SOURCE_MANIFEST } from "./prompt-rollback-source-policy.js";
export declare const PROMPT_ROLLBACK_VERIFICATION_METHODS: readonly ["checksum_compare", "registry_readback", "reload_regression"];
export type PromptRollbackVerificationMethod = typeof PROMPT_ROLLBACK_VERIFICATION_METHODS[number];
export interface PromptChangeLineage {
    sourceRef: string;
    proposedVersion: string;
    proposedChecksum: string;
    baselineVersion: string;
    baselineChecksum: string;
}
export interface PromptChangeRollbackReceipt {
    sourceType: PromptImprovementRollbackSourceType;
    sourceRef: string;
    targetSourceRef: string;
    targetBaselineVersion: string;
    targetBaselineChecksum: string;
    executorId: string;
    verificationMethod: PromptRollbackVerificationMethod | string;
    evidenceRef: string;
}
export type PromptChangeRollbackReadinessDecision = {
    status: "authorized";
    sourceType: PromptImprovementRollbackSourceType;
    sourceRef: string;
    targetSourceRef: string;
    baselineVersion: string;
    baselineChecksum: string;
    executorId: string;
    verificationMethod: PromptRollbackVerificationMethod;
    evidenceRef: string;
} | {
    status: "blocked";
    reasonCode: "change_lineage_invalid" | "rollback_source_invalid" | "rollback_lineage_mismatch" | "rollback_baseline_invalid" | "rollback_executor_missing" | "rollback_verification_missing" | "rollback_evidence_missing";
};
export declare function authorizePromptChangeRollbackReadiness(input: {
    change: PromptChangeLineage;
    rollback: PromptChangeRollbackReceipt;
}): PromptChangeRollbackReadinessDecision;
//# sourceMappingURL=prompt-change-rollback-readiness.d.ts.map