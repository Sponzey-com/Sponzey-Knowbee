import type { WebDocumentChunk } from "./web-document-chunk.js";
export interface WebEvidenceSourceMetadata {
    readonly sourceTitle: string;
    readonly url: string;
    readonly publishedAt: string | null;
    readonly retrievedAt: string;
    readonly evidenceRef: string;
    readonly budgetFingerprint: `sha256:${string}`;
}
export interface WebEvidenceUnit {
    readonly unitRef: `sha256:${string}`;
    readonly claim: string;
    readonly evidence: string;
    readonly sourceTitle: string;
    readonly url: string;
    readonly publishedAt: string | null;
    readonly retrievedAt: string;
    readonly evidenceRef: string;
    readonly chunkRefs: readonly string[];
    readonly factKey: string;
    readonly supportType: "direct" | "inference";
    readonly confidence: number;
    readonly budgetFingerprint: `sha256:${string}`;
}
export interface WebEvidenceCompressionResult {
    readonly budgetFingerprint: `sha256:${string}`;
    readonly evidenceRef: string;
    readonly units: readonly WebEvidenceUnit[];
    readonly unresolvedFactKeys: readonly string[];
}
export type WebEvidenceCompressionAdmission = Readonly<{
    ok: true;
    value: WebEvidenceCompressionResult;
}> | Readonly<{
    ok: false;
    reasonCode: "web_evidence_compression_context_invalid" | "web_evidence_compression_receipt_invalid" | "web_evidence_compression_fingerprint_mismatch" | "web_evidence_compression_reference_invalid" | "web_evidence_compression_fact_invalid" | "web_evidence_compression_excerpt_invalid" | "web_evidence_compression_confidence_invalid" | "web_evidence_compression_duplicate";
}>;
export interface WebEvidenceCompressionContext {
    readonly source: WebEvidenceSourceMetadata;
    readonly selectedChunks: readonly WebDocumentChunk[];
    readonly requiredFactKeys: readonly string[];
}
export declare function validateWebEvidenceCompressionContext(context: WebEvidenceCompressionContext): boolean;
export declare function admitWebEvidenceCompression(receipt: unknown, context: WebEvidenceCompressionContext): WebEvidenceCompressionAdmission;
//# sourceMappingURL=web-evidence-compression.d.ts.map