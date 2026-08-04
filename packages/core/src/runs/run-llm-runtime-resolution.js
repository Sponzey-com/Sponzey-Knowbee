export function resolveRunLlmRuntime(input) {
    const model = input.model?.trim();
    if (!model)
        return { status: "unavailable", reasonCode: "model_missing" };
    if (input.explicitProvider) {
        const providerId = input.providerId?.trim() || input.explicitProvider.id.trim();
        if (!providerId)
            return { status: "unavailable", reasonCode: "provider_missing" };
        return {
            status: "ready",
            provider: input.explicitProvider,
            providerId,
            model,
            source: "explicit",
        };
    }
    const providerId = input.providerId?.trim();
    if (!providerId)
        return { status: "unavailable", reasonCode: "provider_missing" };
    try {
        const resolved = input.resolver.resolveConfiguredProvider({ providerId });
        if (resolved.providerId.trim() !== providerId) {
            return {
                status: "unavailable",
                reasonCode: "configured_provider_context_missing",
            };
        }
        return {
            status: "ready",
            provider: resolved.provider,
            providerId,
            model,
            source: "configured",
        };
    }
    catch {
        return { status: "unavailable", reasonCode: "provider_resolution_failed" };
    }
}
export function toRunLlmRuntimePreflightFailure(resolution) {
    if (resolution.status === "ready")
        return null;
    if (resolution.reasonCode !== "provider_resolution_failed" &&
        resolution.reasonCode !== "configured_provider_context_missing") {
        return null;
    }
    const contextMismatch = resolution.reasonCode === "configured_provider_context_missing";
    return {
        code: "ai_connection_unavailable",
        summary: contextMismatch
            ? "Configured AI execution context did not match the startup snapshot."
            : "Configured AI provider could not be initialized.",
        userMessage: contextMismatch
            ? "저장된 AI 연결과 현재 실행 컨텍스트가 일치하지 않아 요청을 시작하지 않았습니다. Gateway를 다시 시작한 뒤 AI 연결 설정을 확인해 주세요."
            : "저장된 AI 연결을 초기화하지 못해 요청을 시작하지 않았습니다. AI 연결 상태를 확인한 뒤 다시 시도해 주세요.",
        eventLabel: `preflight_failed: ${resolution.reasonCode}`,
    };
}
//# sourceMappingURL=run-llm-runtime-resolution.js.map