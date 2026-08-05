import type { AIProvider, ChatParams } from "../ai/types.js";
import type { LlmDiagnosisProvider } from "../contracts/llm-diagnosis-provider.js";
import type { LlmDiagnosisSchemaRepairProvider } from "../contracts/llm-diagnosis-schema-repair-provider.js";
export interface RuntimeDiagnosisProviderPair {
    diagnosisProvider: LlmDiagnosisProvider;
    diagnosisRepairProvider: LlmDiagnosisSchemaRepairProvider;
}
export interface RuntimeDiagnosisProviderFactoryInput {
    provider: AIProvider;
    model: string;
    workDir: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export type RuntimeDiagnosisProviderFactory = (input: RuntimeDiagnosisProviderFactoryInput) => RuntimeDiagnosisProviderPair;
export type RuntimeDiagnosisProviderReasonCode = "provider_missing" | "model_missing" | "diagnosis_provider_factory_failed";
export type RuntimeDiagnosisProviderResolution = {
    status: "ready";
    diagnosisProvider: LlmDiagnosisProvider;
    diagnosisRepairProvider: LlmDiagnosisSchemaRepairProvider;
    fieldDebugEvent: string;
} | {
    status: "skipped";
    reasonCode: Exclude<RuntimeDiagnosisProviderReasonCode, "diagnosis_provider_factory_failed">;
    fieldDebugEvent: string;
} | {
    status: "unavailable";
    reasonCode: "diagnosis_provider_factory_failed";
    fieldDebugEvent: string;
};
export interface CreateRuntimeDiagnosisProviderPairInput {
    provider?: AIProvider | undefined;
    model?: string | undefined;
    workDir: string;
    factory?: RuntimeDiagnosisProviderFactory | undefined;
    observabilityContext?: RuntimeDiagnosisProviderFactoryInput["observabilityContext"];
}
export declare function createRuntimeDiagnosisProviderPair(input: CreateRuntimeDiagnosisProviderPairInput): RuntimeDiagnosisProviderResolution;
//# sourceMappingURL=diagnosis-provider-runtime.d.ts.map