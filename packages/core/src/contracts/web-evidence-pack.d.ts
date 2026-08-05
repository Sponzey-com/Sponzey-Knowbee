import type { WebEvidenceCompressionResult, WebEvidenceUnit } from "./web-evidence-compression.js";
import type { TokenEstimatorPort, WebResearchContextBudget } from "./web-research-context-budget.js";
export interface WebEvidenceConflict {
    readonly factKey: string;
    readonly unitRefs: readonly string[];
    readonly reason: string;
}
export interface WebEvidenceReview {
    readonly evidenceSnapshotFingerprint: `sha256:${string}`;
    readonly budgetFingerprint: `sha256:${string}`;
    readonly duplicateGroups: readonly (readonly string[])[];
    readonly conflicts: readonly WebEvidenceConflict[];
    readonly unresolvedFactKeys: readonly string[];
}
export interface WebEvidencePack {
    readonly schemaVersion: 1;
    readonly packFingerprint: `sha256:${string}`;
    readonly budgetFingerprint: `sha256:${string}`;
    readonly evidenceSnapshotFingerprint: `sha256:${string}`;
    readonly units: readonly WebEvidenceUnit[];
    readonly conflicts: readonly WebEvidenceConflict[];
    readonly unresolvedFactKeys: readonly string[];
    readonly provenanceIndex: readonly Readonly<{
        evidenceRef: string;
        sourceTitle: string;
        url: string;
        publishedAt: string | null;
        retrievedAt: string;
        chunkRefs: readonly string[];
    }>[];
    readonly droppedUnitRefs: readonly string[];
    readonly totalTokenEstimate: number;
}
export type WebEvidencePackResult = Readonly<{
    ok: true;
    value: WebEvidencePack;
}> | Readonly<{
    ok: false;
    reasonCode: "web_evidence_pack_input_invalid" | "web_evidence_review_receipt_invalid" | "web_evidence_review_fingerprint_mismatch" | "web_evidence_review_reference_invalid" | "web_evidence_review_fact_invalid" | "web_evidence_pack_estimator_invalid" | "web_evidence_pack_budget_exhausted";
}>;
export declare function webEvidenceSnapshotFingerprint(units: readonly WebEvidenceUnit[], requiredFactKeys: readonly string[], budgetFingerprint: string): `sha256:${string}`;
export declare function admitWebEvidenceReview(input: Readonly<{
    receipt: unknown;
    units: readonly WebEvidenceUnit[];
    requiredFactKeys: readonly string[];
    budgetFingerprint: `sha256:${string}`;
    evidenceSnapshotFingerprint: `sha256:${string}`;
}>): WebEvidencePackResult | Readonly<{
    ok: true;
    review: WebEvidenceReview;
}>;
export declare function assembleWebEvidencePack(input: Readonly<{
    budget: WebResearchContextBudget;
    units: readonly WebEvidenceUnit[];
    compressionResults: readonly WebEvidenceCompressionResult[];
    review: WebEvidenceReview;
    estimator: TokenEstimatorPort;
}>): WebEvidencePackResult;
//# sourceMappingURL=web-evidence-pack.d.ts.map