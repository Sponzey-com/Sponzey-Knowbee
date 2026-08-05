import { type TokenEstimatorPort } from "../contracts/web-research-context-budget.js";
import type { ToolResult } from "../tools/types.js";
import { type WebSourceSelectionPort } from "./web-source-selection.js";
import { type WebChunkSelectionPort } from "./web-chunk-selection.js";
import { type WebEvidenceCompressionPort } from "./web-evidence-compression.js";
import { type WebEvidenceReviewPort } from "./web-evidence-pack.js";
import { type WebEvidenceVerifierPort } from "./web-evidence-verifier.js";
import type { WebEvidenceVerificationResult } from "../contracts/web-evidence-verifier.js";
export interface WebEvidenceSourceFetchPort {
    (input: Readonly<{
        candidateRef: string;
        url: string;
        signal: AbortSignal;
    }>): Promise<ToolResult>;
}
export type WebEvidencePipelineResult = Readonly<{
    ok: true;
    value: WebEvidenceVerificationResult;
}> | Readonly<{
    ok: false;
    reasonCode: "web_evidence_pipeline_cancelled" | "web_evidence_pipeline_budget_failed" | "web_evidence_pipeline_search_observation_failed" | "web_evidence_pipeline_source_selection_failed" | "web_evidence_pipeline_fetch_failed" | "web_evidence_pipeline_chunk_failed" | "web_evidence_pipeline_chunk_selection_failed" | "web_evidence_pipeline_compression_failed" | "web_evidence_pipeline_pack_failed" | "web_evidence_pipeline_verification_failed";
}>;
export declare function runWebEvidencePipeline(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    modelContextTokens: number;
    systemToolText: string;
    conversationText: string;
    searchResult: ToolResult;
    signal: AbortSignal;
}>, dependencies: Readonly<{
    estimator: TokenEstimatorPort;
    sourceSelectionPort: WebSourceSelectionPort;
    fetchSource: WebEvidenceSourceFetchPort;
    chunkSelectionPort: WebChunkSelectionPort;
    compressionPort: WebEvidenceCompressionPort;
    evidenceReviewPort: WebEvidenceReviewPort;
    verifierPort: WebEvidenceVerifierPort;
}>): Promise<WebEvidencePipelineResult>;
export declare function runDirectWebEvidencePipeline(input: Readonly<{
    requestGoal: string;
    requiredFactKeys: readonly string[];
    modelContextTokens: number;
    systemToolText: string;
    conversationText: string;
    documentResult: ToolResult;
    signal: AbortSignal;
}>, dependencies: Readonly<{
    estimator: TokenEstimatorPort;
    chunkSelectionPort: WebChunkSelectionPort;
    compressionPort: WebEvidenceCompressionPort;
    evidenceReviewPort: WebEvidenceReviewPort;
    verifierPort: WebEvidenceVerifierPort;
}>): Promise<WebEvidencePipelineResult>;
//# sourceMappingURL=web-evidence-pipeline.d.ts.map