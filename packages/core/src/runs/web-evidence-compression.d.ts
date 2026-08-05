import { type WebEvidenceCompressionAdmission, type WebEvidenceSourceMetadata } from "../contracts/web-evidence-compression.js";
import type { WebDocumentChunk } from "../contracts/web-document-chunk.js";
export interface WebEvidenceCompressionPort {
    compressEvidence(input: Readonly<{
        requestGoal: string;
        requiredFactKeys: readonly string[];
        source: WebEvidenceSourceMetadata;
        selectedChunks: readonly WebDocumentChunk[];
    }>): Promise<unknown>;
}
export declare function compressWebResearchEvidence(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    source: WebEvidenceSourceMetadata;
    selectedChunks: readonly WebDocumentChunk[];
}>, port: WebEvidenceCompressionPort): Promise<WebEvidenceCompressionAdmission>;
//# sourceMappingURL=web-evidence-compression.d.ts.map