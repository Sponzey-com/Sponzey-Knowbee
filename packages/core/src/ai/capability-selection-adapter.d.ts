import type { LlmCapabilitySelectionAttemptProvider, LlmCapabilitySelectionAttemptResult, LlmCapabilitySelectionDecision, LlmCapabilitySelectionProvider, LlmCapabilitySelectionProviderInput, LlmCapabilitySelectionSchemaRepairProvider, LlmCapabilitySelectionSchemaRepairProviderInput } from "../contracts/llm-capability-selection.js";
import type { AIProvider, ChatParams } from "./types.js";
export interface AiChatCapabilitySelectionProviderAdapterOptions {
    provider: AIProvider;
    model: string;
    capabilitySelectionPromptSourceBlock: string;
    maxTokens?: number;
    deadlineMs?: number;
    maxVisibleTextBytes?: number;
    workDir?: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare class AiChatCapabilitySelectionProviderAdapter implements LlmCapabilitySelectionProvider, LlmCapabilitySelectionAttemptProvider, LlmCapabilitySelectionSchemaRepairProvider {
    private readonly options;
    constructor(options: AiChatCapabilitySelectionProviderAdapterOptions);
    selectCapability(input: LlmCapabilitySelectionProviderInput): Promise<LlmCapabilitySelectionDecision>;
    attemptCapabilitySelection(input: LlmCapabilitySelectionProviderInput): Promise<LlmCapabilitySelectionAttemptResult>;
    repairCapabilitySelection(input: LlmCapabilitySelectionSchemaRepairProviderInput): Promise<LlmCapabilitySelectionAttemptResult>;
    private jsonInstruction;
    private runAttempt;
}
//# sourceMappingURL=capability-selection-adapter.d.ts.map