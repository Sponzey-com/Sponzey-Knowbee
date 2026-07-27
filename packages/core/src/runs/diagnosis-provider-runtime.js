import { redactLogText } from "../logger/index.js";
import { createFileBackedDiagnosisProvider } from "../orchestration/prompt-policy-adapter.js";
function defaultRuntimeDiagnosisProviderFactory(input) {
    const adapter = createFileBackedDiagnosisProvider(input);
    return {
        diagnosisProvider: adapter,
        diagnosisRepairProvider: adapter,
    };
}
function safeReasonDetail(error) {
    const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : String(error ?? "unknown_error");
    return redactLogText(message).replace(/\s+/g, "_").slice(0, 120);
}
function fieldDebugEvent(status, reasonCode, detail) {
    return ["runtime_diagnosis_provider", status, reasonCode, detail].filter(Boolean).join(":");
}
export function createRuntimeDiagnosisProviderPair(input) {
    if (!input.provider) {
        return {
            status: "skipped",
            reasonCode: "provider_missing",
            fieldDebugEvent: fieldDebugEvent("skipped", "provider_missing"),
        };
    }
    const model = input.model?.trim();
    if (!model) {
        return {
            status: "skipped",
            reasonCode: "model_missing",
            fieldDebugEvent: fieldDebugEvent("skipped", "model_missing"),
        };
    }
    try {
        const factory = input.factory ?? defaultRuntimeDiagnosisProviderFactory;
        const pair = factory({
            provider: input.provider,
            model,
            workDir: input.workDir,
            ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
        });
        return {
            status: "ready",
            diagnosisProvider: pair.diagnosisProvider,
            diagnosisRepairProvider: pair.diagnosisRepairProvider,
            fieldDebugEvent: fieldDebugEvent("ready"),
        };
    }
    catch (error) {
        return {
            status: "unavailable",
            reasonCode: "diagnosis_provider_factory_failed",
            fieldDebugEvent: fieldDebugEvent("unavailable", "diagnosis_provider_factory_failed", safeReasonDetail(error)),
        };
    }
}
//# sourceMappingURL=diagnosis-provider-runtime.js.map