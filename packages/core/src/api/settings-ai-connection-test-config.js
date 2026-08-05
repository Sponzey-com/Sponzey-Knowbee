const PROVIDERS = new Set([
    "openai",
    "anthropic",
    "gemini",
    "ollama",
    "llama",
    "custom",
]);
export function buildSettingsAiConnectionTestConfig(base, input) {
    const provider = input.providerType?.trim();
    const model = input.defaultModel?.trim() ?? "";
    if (!PROVIDERS.has(provider) || !provider)
        throw new Error("ai_test_provider_required");
    if (!model)
        throw new Error("ai_test_model_required");
    const authMode = input.authMode === "chatgpt_oauth" ? "chatgpt_oauth" : "api_key";
    const saved = base.ai.connection;
    const inheritSavedAuth = saved.provider === provider && (saved.auth?.mode ?? "api_key") === authMode;
    const credentials = input.credentials ?? {};
    const auth = {
        ...(inheritSavedAuth ? saved.auth : {}),
        mode: authMode,
        ...(credentials.apiKey?.trim() ? { apiKey: credentials.apiKey.trim() } : {}),
        ...(credentials.username?.trim() ? { username: credentials.username.trim() } : {}),
        ...(credentials.password?.trim() ? { password: credentials.password.trim() } : {}),
        ...(credentials.oauthAuthFilePath?.trim()
            ? { oauthAuthFilePath: credentials.oauthAuthFilePath.trim() }
            : {}),
    };
    const endpoint = input.endpoint?.trim();
    return {
        ...base,
        ai: {
            connection: {
                provider,
                model,
                ...(endpoint ? { endpoint } : {}),
                auth,
            },
        },
    };
}
//# sourceMappingURL=settings-ai-connection-test-config.js.map