import { redactLogText } from "../logger/index.js";
import { createFileBackedSolutionPlanProvider } from "../orchestration/prompt-policy-adapter.js";
export function createRuntimeSolutionPlanProvider(input) {
    if (!input.provider) {
        return {
            status: "skipped",
            reasonCode: "provider_missing",
            fieldDebugEvent: "runtime_solution_plan_provider:skipped:provider_missing",
        };
    }
    const model = input.model?.trim();
    if (!model) {
        return {
            status: "skipped",
            reasonCode: "model_missing",
            fieldDebugEvent: "runtime_solution_plan_provider:skipped:model_missing",
        };
    }
    try {
        const solutionPlanProvider = (input.factory ?? createFileBackedSolutionPlanProvider)({
            provider: input.provider,
            model,
            workDir: input.workDir,
            ...(input.observabilityContext ? { observabilityContext: input.observabilityContext } : {}),
        });
        return {
            status: "ready",
            solutionPlanProvider,
            solutionPlanRepairProvider: solutionPlanProvider,
            fieldDebugEvent: "runtime_solution_plan_provider:ready",
        };
    }
    catch (error) {
        const detail = redactLogText(error instanceof Error ? error.message : String(error))
            .replace(/\s+/gu, "_")
            .slice(0, 120);
        return {
            status: "unavailable",
            reasonCode: "solution_plan_provider_factory_failed",
            fieldDebugEvent: `runtime_solution_plan_provider:unavailable:solution_plan_provider_factory_failed:${detail}`,
        };
    }
}
//# sourceMappingURL=solution-plan-provider-runtime.js.map