import type { AIProvider, ChatParams } from "../ai/types.js";
import type { LlmCapabilitySelectionAttemptProvider, LlmCapabilitySelectionSchemaRepairProvider } from "../contracts/llm-capability-selection.js";
export interface RuntimeCapabilitySelectionProviderFactoryInput {
    provider: AIProvider;
    model: string;
    workDir: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
    maxTokens: number;
    deadlineMs: number;
    maxVisibleTextBytes: number;
}
export type RuntimeCapabilitySelectionProviderResolution = {
    status: "ready";
    capabilitySelectionProvider: LlmCapabilitySelectionAttemptProvider & LlmCapabilitySelectionSchemaRepairProvider;
    fieldDebugEvent: string;
} | {
    status: "skipped";
    reasonCode: "provider_missing" | "model_missing";
    fieldDebugEvent: string;
} | {
    status: "unavailable";
    reasonCode: "capability_selection_provider_factory_failed";
    fieldDebugEvent: string;
};
export declare function createRuntimeCapabilitySelectionProvider(input: {
    provider?: AIProvider;
    model?: string;
    workDir: string;
    observabilityContext?: RuntimeCapabilitySelectionProviderFactoryInput["observabilityContext"];
    factory?: (input: RuntimeCapabilitySelectionProviderFactoryInput) => LlmCapabilitySelectionAttemptProvider & LlmCapabilitySelectionSchemaRepairProvider;
}): RuntimeCapabilitySelectionProviderResolution;
//# sourceMappingURL=capability-selection-provider-runtime.d.ts.map