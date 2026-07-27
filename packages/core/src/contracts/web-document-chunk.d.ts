import type { TokenEstimatorPort } from "./web-research-context-budget.js";
import { type WebDocument } from "./web-retrieval.js";
export interface WebDocumentChunk {
    readonly chunkRef: string;
    readonly documentEvidenceRef: string;
    readonly ordinal: number;
    readonly headingPath: readonly string[];
    readonly content: string;
    readonly estimatedTokens: number;
    readonly contentFingerprint: `sha256:${string}`;
    readonly sourceOffsets: Readonly<{
        start: number;
        end: number;
    }>;
    readonly budgetFingerprint: `sha256:${string}`;
}
export type WebDocumentChunkResult = Readonly<{
    ok: true;
    value: readonly WebDocumentChunk[];
}> | Readonly<{
    ok: false;
    reasonCode: "web_chunk_document_invalid" | "web_chunk_budget_fingerprint_invalid" | "web_chunk_estimator_invalid" | "web_chunk_content_unbreakable";
}>;
export declare function chunkWebDocument(input: Readonly<{
    document: WebDocument;
    budgetFingerprint: string;
}>, estimator: TokenEstimatorPort): WebDocumentChunkResult;
//# sourceMappingURL=web-document-chunk.d.ts.map