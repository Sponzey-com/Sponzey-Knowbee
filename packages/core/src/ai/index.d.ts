import type { AIConnectionConfig, KnowbeeConfig } from "../config/types.js";
import type { AIProvider } from "./types.js";
export type AIProviderConfigSnapshot = Pick<KnowbeeConfig, "ai">;
export type ProviderCredentialKind = "api_key" | "chatgpt_oauth" | "local_endpoint" | "custom_endpoint" | "none";
export type ProviderAdapterType = "openai_chat" | "openai_codex_oauth" | "openai_compatible" | "anthropic" | "gemini" | "none";
export type ProviderBaseUrlClass = "official_openai" | "chatgpt_codex" | "local" | "custom" | "provider_native" | "none";
export interface ProviderAuditTrace {
    source: "config.ai.connection";
    profileId?: string | undefined;
    requestedProviderId: string;
    providerId: string;
    adapterType: ProviderAdapterType;
    baseUrlClass: ProviderBaseUrlClass;
    modelId: string;
    authType: ProviderCredentialKind;
    credentialSourceKind?: ProviderCredentialKind | undefined;
    resolverPath?: string | undefined;
    endpointMismatch?: boolean | undefined;
    configured: boolean;
    healthy: boolean;
    fallbackReason: string | null;
    diagnosticId: string;
}
export interface ProviderResolutionSnapshot {
    source: "config.ai.connection";
    providerId: string;
    credentialKind: ProviderCredentialKind;
    adapterType: ProviderAdapterType;
    authType: ProviderCredentialKind;
    baseUrlClass: ProviderBaseUrlClass;
    authMode: "api_key" | "chatgpt_oauth";
    model: string;
    endpoint: string;
    configured: boolean;
    enabled: boolean;
    healthy: boolean;
    fallbackReason: string | null;
    diagnosticId: string;
    auditTrace: ProviderAuditTrace;
}
export interface ResolvedAiConnection extends ProviderResolutionSnapshot {
    requestedProviderId: string;
    connection: AIConnectionConfig;
}
export interface ResolvedAiProvider {
    providerId: string;
    model: string;
    provider: AIProvider;
    resolution: ResolvedAiConnection;
}
export declare function normalizeOpenAICompatibleEndpoint(providerId: "openai" | "ollama" | "llama" | "custom", endpoint: string | undefined): string | undefined;
export declare function resetAIProviderCache(): void;
export declare function getActiveAIConnection(config: AIProviderConfigSnapshot): AIConnectionConfig;
export declare function resolveAIConnection(connection: AIConnectionConfig, providerId?: string): ResolvedAiConnection;
export declare function resolveProviderResolutionSnapshot(providerId: string | undefined, config: AIProviderConfigSnapshot): ProviderResolutionSnapshot;
export declare function detectAvailableProvider(config: AIProviderConfigSnapshot): string;
export declare function getDefaultModel(config: AIProviderConfigSnapshot): string;
export declare function inferProviderId(_model: string, config: AIProviderConfigSnapshot): string;
export declare function createProviderForConnection(connection: AIConnectionConfig): AIProvider;
export declare function resolveProviderForConnection(connection: AIConnectionConfig, providerId?: string): ResolvedAiProvider | null;
export declare function getProvider(providerId: string | undefined, config: AIProviderConfigSnapshot): AIProvider;
export declare function shouldForceReasoningMode(providerId: string, model: string, config: AIProviderConfigSnapshot): boolean;
export declare function formatProviderAuditTrace(trace: ProviderAuditTrace): string;
export { AiChatDiagnosisProviderAdapter } from "./diagnosis-adapter.js";
export type { AiChatDiagnosisProviderAdapterOptions } from "./diagnosis-adapter.js";
export { AiChatSolutionPlanProviderAdapter } from "./solution-plan-adapter.js";
export type { AiChatSolutionPlanProviderAdapterOptions } from "./solution-plan-adapter.js";
export { AiChatCapabilitySelectionProviderAdapter } from "./capability-selection-adapter.js";
export type { AiChatCapabilitySelectionProviderAdapterOptions } from "./capability-selection-adapter.js";
export { collectStructuredJsonAttempt, StructuredJsonAttemptError, } from "./structured-json-attempt.js";
export type { StructuredJsonAttemptFailureStatus, StructuredJsonAttemptResult, } from "./structured-json-attempt.js";
export { AiChatWebResearchMethodProviderAdapter } from "./web-research-method-adapter.js";
export type { AiChatWebResearchMethodProviderAdapterOptions } from "./web-research-method-adapter.js";
export type { AIProvider, AIChunk, Message, ToolDefinition, ChatParams } from "./types.js";
//# sourceMappingURL=index.d.ts.map