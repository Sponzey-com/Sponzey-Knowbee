import type { AIProvider } from "../ai/types.js";
import type { StartPreflightFailure } from "./preflight.js";
export interface RunLlmRuntimeResolverPort {
    resolveConfiguredProvider(input: {
        providerId: string;
    }): {
        provider: AIProvider;
        providerId: string;
    };
}
export type RunLlmRuntimeResolution = {
    status: "ready";
    provider: AIProvider;
    providerId: string;
    model: string;
    source: "explicit" | "configured";
} | {
    status: "unavailable";
    reasonCode: "model_missing" | "provider_missing" | "provider_resolution_failed" | "configured_provider_context_missing";
};
export declare function resolveRunLlmRuntime(input: {
    explicitProvider?: AIProvider | undefined;
    providerId?: string | undefined;
    model?: string | undefined;
    resolver: RunLlmRuntimeResolverPort;
}): RunLlmRuntimeResolution;
export declare function toRunLlmRuntimePreflightFailure(resolution: RunLlmRuntimeResolution): StartPreflightFailure | null;
//# sourceMappingURL=run-llm-runtime-resolution.d.ts.map