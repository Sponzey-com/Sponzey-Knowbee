export declare const DUPLICATE_ARTIFACT_CATEGORIES: readonly ["implementation", "prompt", "schema", "documentation"];
export declare const TEMPORARY_ARTIFACT_KINDS: readonly ["compatibility_code", "temporary_prompt", "experiment", "backup"];
export declare const TEMPORARY_REMOVAL_CONDITIONS: readonly ["date_reached", "replacement_verified", "experiment_closed", "backup_retention_elapsed"];
export declare const INDIRECT_IMPLEMENTATION_KINDS: readonly ["wrapper", "duplicate_adapter", "hidden_global_state"];
export type DuplicateArtifactCategory = typeof DUPLICATE_ARTIFACT_CATEGORIES[number];
export type MaintenanceTemporaryArtifactKind = typeof TEMPORARY_ARTIFACT_KINDS[number];
export type TemporaryRemovalCondition = typeof TEMPORARY_REMOVAL_CONDITIONS[number];
export type IndirectImplementationKind = typeof INDIRECT_IMPLEMENTATION_KINDS[number];
export interface DuplicateArtifactEntry {
    artifactId: string;
    role: "canonical" | "duplicate";
    disposition: "retain" | "remove" | "migrate";
    migrationTargetArtifactId?: string;
    evidenceRef: string;
}
export interface CanonicalArtifactGroupReceipt {
    responsibilityId: string;
    category: DuplicateArtifactCategory;
    canonicalArtifactId: string;
    owner: string;
    artifacts: readonly DuplicateArtifactEntry[];
}
export interface TemporaryArtifactLifecycleReceipt {
    artifactId: string;
    kind: MaintenanceTemporaryArtifactKind;
    owner: string;
    createdAt: number;
    expiresAt: number;
    removalCondition: TemporaryRemovalCondition;
    removalConditionSatisfied: boolean;
    disposition: "retain" | "remove";
    evidenceRef: string;
}
export interface IndirectImplementationAssessment {
    assessmentId: string;
    kind: IndirectImplementationKind;
    directImplementationSufficient: boolean;
    complexityRemoved: number;
    duplicationRemoved: number;
    standardBoundaryId?: string;
    justification: string;
    proposedDisposition: "use_direct" | "add_indirection";
    evidenceRef: string;
}
export type MaintenanceSimplificationDecision = {
    status: "authorized";
    action: "consolidate" | "remove_temporary" | "retain_temporary" | "use_direct" | "add_indirection";
    subjectId: string;
} | {
    status: "blocked";
    reasonCode: "canonical_group_invalid" | "canonical_owner_ambiguous" | "duplicate_disposition_invalid" | "migration_target_invalid" | "temporary_lifecycle_invalid" | "temporary_expired_but_retained" | "temporary_removal_premature" | "indirection_assessment_invalid" | "hidden_global_state_forbidden" | "unnecessary_indirection";
    subjectId?: string;
};
export declare function authorizeCanonicalArtifactConsolidation(group: CanonicalArtifactGroupReceipt): MaintenanceSimplificationDecision;
export declare function authorizeTemporaryArtifactDisposition(input: {
    receipt: TemporaryArtifactLifecycleReceipt;
    now: number;
}): MaintenanceSimplificationDecision;
export declare function authorizeIndirectImplementation(assessment: IndirectImplementationAssessment): MaintenanceSimplificationDecision;
export declare function applyMaintenanceSimplification<T>(input: {
    decision: MaintenanceSimplificationDecision;
    apply: (authorization: Extract<MaintenanceSimplificationDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "applied";
    result: T;
} | Extract<MaintenanceSimplificationDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=maintenance-simplification-policy.d.ts.map