export interface OpenAICodexOAuthEnvironmentSnapshot {
    codexHome: string;
    clientId: string;
}
export declare function createOpenAICodexOAuthEnvironmentSnapshot(env: Readonly<Record<string, string | undefined>>): OpenAICodexOAuthEnvironmentSnapshot;
export declare const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
export declare const OPENAI_CODEX_RESPONSES_PATH = "/responses";
export declare const OPENAI_CODEX_MODELS_PATH = "/models";
export declare const OPENAI_CODEX_USER_AGENT = "Codex-Code/1.0.43";
export declare const OPENAI_CODEX_CLIENT_VERSION: string;
export declare const OPENAI_CODEX_KNOWN_MODELS: readonly ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"];
export declare function buildOpenAICodexModelsUrl(baseUrl: string, clientVersion?: string): string;
export declare function parseOpenAICodexModels(payload: unknown): string[];
export interface OpenAICodexOAuthConfig {
    authFilePath?: string | undefined;
    clientId?: string | undefined;
    codexHome?: string | undefined;
}
export interface OpenAICodexAccessToken {
    accessToken: string;
    authFilePath: string;
    expiresAt?: number | undefined;
}
export declare function resolveOpenAICodexBaseUrl(baseUrl?: string | undefined): string;
export declare function resolveOpenAICodexAuthFilePath(config?: OpenAICodexOAuthConfig, envSnapshot?: OpenAICodexOAuthEnvironmentSnapshot): string;
export declare function hasOpenAICodexAuthFile(config?: OpenAICodexOAuthConfig): boolean;
export declare function readOpenAICodexAccessToken(config?: OpenAICodexOAuthConfig, options?: {
    forceRefresh?: boolean;
}): Promise<OpenAICodexAccessToken>;
//# sourceMappingURL=openai-codex-oauth.d.ts.map