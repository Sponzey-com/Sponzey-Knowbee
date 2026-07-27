import type { WebResearchMethodProvider, WebResearchMethodProviderInput } from "../contracts/web-research-method.js";
import type { AIProvider, ChatParams } from "./types.js";
export interface AiChatWebResearchMethodProviderAdapterOptions {
    provider: AIProvider;
    model: string;
    webResearchMethodPromptSourceBlock: string;
    maxTokens?: number;
    workDir?: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare class AiChatWebResearchMethodProviderAdapter implements WebResearchMethodProvider {
    private readonly options;
    constructor(options: AiChatWebResearchMethodProviderAdapterOptions);
    proposeNextAction(input: WebResearchMethodProviderInput): Promise<unknown>;
}
//# sourceMappingURL=web-research-method-adapter.d.ts.map