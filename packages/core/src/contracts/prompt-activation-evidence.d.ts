export declare const DOCUMENTED_PROMPT_ACTIVATION_METHODS: readonly ["restart", "reload", "registry_activation"];
export declare const PROMPT_ACTIVATION_LOADER_KINDS: readonly ["process", "agent"];
export type DocumentedPromptActivationMethod = typeof DOCUMENTED_PROMPT_ACTIVATION_METHODS[number];
export type PromptActivationLoaderKind = typeof PROMPT_ACTIVATION_LOADER_KINDS[number];
export interface PromptActivationLoaderReceipt {
    kind: PromptActivationLoaderKind;
    loaderId: string;
    runtimeId: string;
    runtimeSnapshotId: string;
    evidenceRef: string;
}
export type PromptActivationMethodEvidence = {
    method: "restart";
    previousRuntimeSnapshotId: string;
    nextRuntimeSnapshotId: string;
    evidenceRef: string;
} | {
    method: "reload";
    reloadReceiptId: string;
    runtimeSnapshotId: string;
    evidenceRef: string;
} | {
    method: "registry_activation";
    registryVersionRef: string;
    runtimeSnapshotId: string;
    evidenceRef: string;
};
export interface PromptActivationEvidenceReceipt {
    activationId: string;
    sourceRef: string;
    sourceVersion: string;
    sourceChecksum: string;
    sourceWrittenAt: number;
    activatedAt: number;
    issuedAt: number;
    expiresAt: number;
    loader: PromptActivationLoaderReceipt;
    methodEvidence: PromptActivationMethodEvidence;
}
export type PromptActivationEvidenceDecision = {
    status: "authorized";
    activationId: string;
    sourceRef: string;
    sourceVersion: string;
    sourceChecksum: string;
    loaderId: string;
    activatedAt: number;
    method: DocumentedPromptActivationMethod;
    evidenceRefs: string[];
} | {
    status: "blocked";
    reasonCode: "activation_identity_invalid" | "activation_loader_invalid" | "activation_runtime_mismatch" | "activation_timestamp_invalid" | "activation_receipt_expired" | "activation_method_invalid" | "activation_method_evidence_mismatch";
};
export declare function authorizePromptActivationEvidence(input: {
    receipt: PromptActivationEvidenceReceipt;
    expectedRuntimeId: string;
    expectedRuntimeSnapshotId: string;
    now: number;
}): PromptActivationEvidenceDecision;
export declare function publishPromptActivationEvidence<T>(input: {
    decision: PromptActivationEvidenceDecision;
    publish: (authorization: Extract<PromptActivationEvidenceDecision, {
        status: "authorized";
    }>) => Promise<T>;
}): Promise<{
    status: "published";
    result: T;
} | Extract<PromptActivationEvidenceDecision, {
    status: "blocked";
}>>;
//# sourceMappingURL=prompt-activation-evidence.d.ts.map