import { redactLogText } from "../logger/index.js";
import { createFileBackedCapabilitySelectionProvider } from "../orchestration/prompt-policy-adapter.js";
function safeReasonDetail(error) {
    const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : String(error ?? "unknown_error");
    return redactLogText(message).replace(/\s+/gu, "_").slice(0, 120);
}
export function createRuntimeCapabilitySelectionProvider(input) {
    if (!input.provider) {
        return {
            status: "skipped",
            reasonCode: "provider_missing",
            fieldDebugEvent: "runtime_capability_selection_provider:skipped:provider_missing",
        };
    }
    const model = input.model?.trim();
    if (!model) {
        return {
            status: "skipped",
            reasonCode: "model_missing",
            fieldDebugEvent: "runtime_capability_selection_provider:skipped:model_missing",
        };
    }
    try {
        const capabilitySelectionProvider = (input.factory ?? createFileBackedCapabilitySelectionProvider)({
            provider: input.provider,
            model,
            workDir: input.workDir,
            maxTokens: 12_288,
            deadlineMs: 180_000,
            maxVisibleTextBytes: 65_536,
            ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
        });
        return {
            status: "ready",
            capabilitySelectionProvider,
            fieldDebugEvent: "runtime_capability_selection_provider:ready",
        };
    }
    catch (error) {
        return {
            status: "unavailable",
            reasonCode: "capability_selection_provider_factory_failed",
            fieldDebugEvent: [
                "runtime_capability_selection_provider",
                "unavailable",
                "capability_selection_provider_factory_failed",
                safeReasonDetail(error),
            ].join(":"),
        };
    }
}
//# sourceMappingURL=capability-selection-provider-runtime.js.map