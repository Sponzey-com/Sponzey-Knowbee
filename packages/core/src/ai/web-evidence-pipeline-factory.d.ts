import { AiChatWebEvidencePipelineAdapter } from "./web-evidence-pipeline-adapter.js";
import type { AIProvider, ChatParams } from "./types.js";
export interface FileBackedWebEvidencePipelineAdapterInput {
    provider: AIProvider;
    model: string;
    workDir: string;
    maxTokens?: number;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare const WEB_EVIDENCE_PIPELINE_PROMPT_SOURCE_IDS: readonly ["web_source_selection", "web_chunk_selection", "web_evidence_compression", "web_evidence_review", "web_evidence_verification"];
export declare function createFileBackedWebEvidencePipelineAdapter(input: FileBackedWebEvidencePipelineAdapterInput): AiChatWebEvidencePipelineAdapter;
//# sourceMappingURL=web-evidence-pipeline-factory.d.ts.map