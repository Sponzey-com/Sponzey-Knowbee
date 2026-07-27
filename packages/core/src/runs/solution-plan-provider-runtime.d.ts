import type { AIProvider, ChatParams } from "../ai/types.js";
import type { LlmSolutionPlanProvider, LlmSolutionPlanRepairProvider } from "../contracts/llm-solution-plan-provider.js";
export type RuntimeSolutionPlanProviderResolution = {
    status: "ready";
    solutionPlanProvider: LlmSolutionPlanProvider;
    solutionPlanRepairProvider: LlmSolutionPlanRepairProvider;
    fieldDebugEvent: string;
} | {
    status: "skipped";
    reasonCode: "provider_missing" | "model_missing";
    fieldDebugEvent: string;
} | {
    status: "unavailable";
    reasonCode: "solution_plan_provider_factory_failed";
    fieldDebugEvent: string;
};
export declare function createRuntimeSolutionPlanProvider(input: {
    provider?: AIProvider | undefined;
    model?: string | undefined;
    workDir: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
    factory?: (input: {
        provider: AIProvider;
        model: string;
        workDir: string;
        observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
    }) => LlmSolutionPlanProvider & LlmSolutionPlanRepairProvider;
}): RuntimeSolutionPlanProviderResolution;
//# sourceMappingURL=solution-plan-provider-runtime.d.ts.map