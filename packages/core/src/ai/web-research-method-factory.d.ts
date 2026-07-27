import { AiChatWebResearchMethodProviderAdapter } from "./web-research-method-adapter.js";
import type { AIProvider, ChatParams } from "./types.js";
export interface FileBackedWebResearchMethodProviderInput {
    provider: AIProvider;
    model: string;
    workDir: string;
    maxTokens?: number;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare function createFileBackedWebResearchMethodProvider(input: FileBackedWebResearchMethodProviderInput): AiChatWebResearchMethodProviderAdapter;
//# sourceMappingURL=web-research-method-factory.d.ts.map