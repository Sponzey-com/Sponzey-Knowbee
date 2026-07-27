import type { WebSearchMetadataObservation } from "./web-research-observation.js";
export interface WebSearchMetadataCandidate {
    readonly candidateRef: string;
    readonly rank: number;
    readonly title: string;
    readonly url: string;
    readonly domain: string;
    readonly snippet: string;
    readonly publishedAt: string | null;
    readonly sourceKind: string;
}
export interface WebSearchMetadataSnapshot {
    readonly provider: "DuckDuckGo";
    readonly retrievedAt: string;
    readonly candidates: readonly WebSearchMetadataCandidate[];
    readonly budgetFingerprint: `sha256:${string}`;
    readonly snapshotFingerprint: `sha256:${string}`;
}
export interface WebSourceSelection {
    readonly candidateRef: string;
    readonly relevanceScore: number;
    readonly reason: string;
    readonly factKeys: readonly string[];
}
export interface WebSourceSelectionReceipt {
    readonly snapshotFingerprint: `sha256:${string}`;
    readonly budgetFingerprint: `sha256:${string}`;
    readonly selections: readonly WebSourceSelection[];
}
export type WebSearchMetadataSnapshotResult = Readonly<{
    ok: true;
    value: WebSearchMetadataSnapshot;
}> | Readonly<{
    ok: false;
    reasonCode: "web_search_metadata_snapshot_invalid";
}>;
export type WebSourceSelectionAdmission = Readonly<{
    ok: true;
    value: WebSourceSelectionReceipt;
}> | Readonly<{
    ok: false;
    reasonCode: "web_source_selection_receipt_invalid" | "web_source_selection_fingerprint_mismatch" | "web_source_selection_count_invalid" | "web_source_selection_candidate_invalid" | "web_source_selection_score_invalid" | "web_source_selection_fact_invalid";
}>;
export declare function createWebSearchMetadataSnapshot(input: Readonly<{
    observation: WebSearchMetadataObservation;
    budgetFingerprint: string;
}>): WebSearchMetadataSnapshotResult;
export declare function admitWebSourceSelection(input: Readonly<{
    receipt: unknown;
    snapshot: WebSearchMetadataSnapshot;
    requiredFactKeys: readonly string[];
    maxSelections: number;
}>): WebSourceSelectionAdmission;
//# sourceMappingURL=web-source-selection.d.ts.map