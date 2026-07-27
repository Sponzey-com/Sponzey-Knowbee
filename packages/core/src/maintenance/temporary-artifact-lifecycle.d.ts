export type TemporaryArtifactKind = "stable" | "temporary_compatibility" | "experiment" | "backup";
export interface LifecycleConditionReceipt {
    conditionId: string;
    satisfied: boolean;
    evidenceRefs: string[];
}
export type ExpiryDisposition = {
    kind: "remove";
} | {
    kind: "renew";
    nextLifecycleVersion: string;
    approvalEvidenceRefs: string[];
};
export interface TemporaryArtifactLifecycleManifest {
    artifactId: string;
    kind: TemporaryArtifactKind;
    ownerId?: string;
    createdVersion?: string;
    expiryCondition?: LifecycleConditionReceipt;
    removalCondition?: LifecycleConditionReceipt;
    activeConsumerIds: string[];
    expiryDisposition?: ExpiryDisposition;
}
export type TemporaryArtifactLifecycleDecision = {
    status: "stable";
    artifactId: string;
} | {
    status: "active";
    artifactId: string;
    ownerId: string;
} | {
    status: "renewed";
    artifactId: string;
    ownerId: string;
    nextLifecycleVersion: string;
} | {
    status: "removal_eligible";
    artifactId: string;
    ownerId: string;
};
export declare function evaluateTemporaryArtifactLifecycle(input: TemporaryArtifactLifecycleManifest): TemporaryArtifactLifecycleDecision;
export declare function applyTemporaryArtifactLifecycleDecision(input: {
    decision: TemporaryArtifactLifecycleDecision;
    remove: (artifactId: string) => Promise<void>;
}): Promise<TemporaryArtifactLifecycleDecision | {
    status: "removed";
    artifactId: string;
}>;
//# sourceMappingURL=temporary-artifact-lifecycle.d.ts.map