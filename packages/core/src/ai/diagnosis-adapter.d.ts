import type { LlmDiagnosisProvider, LlmRequestDiagnosisProviderInput, LlmResultDiagnosisProviderInput } from "../contracts/llm-diagnosis-provider.js";
import type { LlmDiagnosisSchemaRepairProvider, LlmDiagnosisSchemaRepairProviderInput } from "../contracts/llm-diagnosis-schema-repair-provider.js";
import type { AIProvider, ChatParams } from "./types.js";
export interface AiChatDiagnosisProviderAdapterOptions {
    provider: AIProvider;
    model: string;
    diagnosisPromptSourceBlock: string;
    maxTokens?: number;
    deadlineMs?: number;
    workDir?: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare class AiChatDiagnosisProviderAdapter implements LlmDiagnosisProvider, LlmDiagnosisSchemaRepairProvider {
    private readonly options;
    constructor(options: AiChatDiagnosisProviderAdapterOptions);
    diagnoseRequest(input: LlmRequestDiagnosisProviderInput): Promise<unknown>;
    diagnoseResult(input: LlmResultDiagnosisProviderInput): Promise<unknown>;
    repairDiagnosis(input: LlmDiagnosisSchemaRepairProviderInput): Promise<unknown>;
    private runJsonPrompt;
}
//# sourceMappingURL=diagnosis-adapter.d.ts.map