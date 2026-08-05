import type { WebChunkSelectionPort } from "../runs/web-chunk-selection.js";
import type { WebEvidenceCompressionPort } from "../runs/web-evidence-compression.js";
import type { WebEvidenceReviewPort } from "../runs/web-evidence-pack.js";
import type { WebEvidenceVerifierPort } from "../runs/web-evidence-verifier.js";
import type { WebSourceSelectionPort } from "../runs/web-source-selection.js";
import type { AIProvider, ChatParams } from "./types.js";
export declare const WEB_EVIDENCE_AI_OPERATIONS: readonly ["web_source_selection", "web_chunk_selection", "web_evidence_compression", "web_evidence_review", "web_evidence_verification"];
export type WebEvidenceAiOperation = (typeof WEB_EVIDENCE_AI_OPERATIONS)[number];
export interface AiChatWebEvidencePipelineAdapterOptions {
    provider: AIProvider;
    model: string;
    promptSourceBlocks: Readonly<Record<WebEvidenceAiOperation, string>>;
    maxTokens?: number;
    workDir?: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare class AiChatWebEvidencePipelineAdapter implements WebSourceSelectionPort, WebChunkSelectionPort, WebEvidenceCompressionPort, WebEvidenceReviewPort, WebEvidenceVerifierPort {
    private readonly options;
    constructor(options: AiChatWebEvidencePipelineAdapterOptions);
    private request;
    selectSources(input: Parameters<WebSourceSelectionPort["selectSources"]>[0]): Promise<unknown>;
    selectChunks(input: Parameters<WebChunkSelectionPort["selectChunks"]>[0]): Promise<unknown>;
    compressEvidence(input: Parameters<WebEvidenceCompressionPort["compressEvidence"]>[0]): Promise<unknown>;
    reviewEvidence(input: Parameters<WebEvidenceReviewPort["reviewEvidence"]>[0]): Promise<unknown>;
    verifyEvidence(input: Parameters<WebEvidenceVerifierPort["verifyEvidence"]>[0]): Promise<unknown>;
}
//# sourceMappingURL=web-evidence-pipeline-adapter.d.ts.map