import type { WebDocumentChunk } from "./web-document-chunk.js";
export interface WebChunkSelectionSnapshot {
    readonly documentEvidenceRef: string;
    readonly budgetFingerprint: `sha256:${string}`;
    readonly chunks: readonly WebDocumentChunk[];
    readonly duplicateChunkRefs: readonly string[];
    readonly snapshotFingerprint: `sha256:${string}`;
}
export interface WebChunkSelection {
    readonly chunkRef: string;
    readonly relevanceScore: number;
    readonly factKeys: readonly string[];
}
export interface WebChunkSelectionReceipt {
    readonly snapshotFingerprint: `sha256:${string}`;
    readonly budgetFingerprint: `sha256:${string}`;
    readonly selections: readonly WebChunkSelection[];
}
export type WebChunkSelectionSnapshotResult = Readonly<{
    ok: true;
    value: WebChunkSelectionSnapshot;
}> | Readonly<{
    ok: false;
    reasonCode: "web_chunk_selection_snapshot_invalid";
}>;
export type WebChunkSelectionAdmission = Readonly<{
    ok: true;
    value: WebChunkSelectionReceipt;
}> | Readonly<{
    ok: false;
    reasonCode: "web_chunk_selection_receipt_invalid" | "web_chunk_selection_fingerprint_mismatch" | "web_chunk_selection_count_invalid" | "web_chunk_selection_reference_invalid" | "web_chunk_selection_score_invalid" | "web_chunk_selection_fact_invalid";
}>;
export declare function createWebChunkSelectionSnapshot(rawChunks: readonly WebDocumentChunk[]): WebChunkSelectionSnapshotResult;
export declare function admitWebChunkSelection(input: Readonly<{
    receipt: unknown;
    snapshot: WebChunkSelectionSnapshot;
    requiredFactKeys: readonly string[];
    maxSelections: number;
}>): WebChunkSelectionAdmission;
//# sourceMappingURL=web-chunk-selection.d.ts.map