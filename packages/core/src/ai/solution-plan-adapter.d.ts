import type { LlmSolutionPlanProvider, LlmSolutionPlanProviderInput, LlmSolutionPlanRepairProvider, LlmSolutionPlanRepairProviderInput } from "../contracts/llm-solution-plan-provider.js";
import type { AIProvider, ChatParams } from "./types.js";
export interface AiChatSolutionPlanProviderAdapterOptions {
    provider: AIProvider;
    model: string;
    solutionPlanPromptSourceBlock: string;
    maxTokens?: number;
    deadlineMs?: number;
    maxVisibleTextBytes?: number;
    workDir?: string;
    observabilityContext?: Pick<NonNullable<ChatParams["observability"]>, "runId" | "requestGroupId" | "sessionId">;
}
export declare class AiChatSolutionPlanProviderAdapter implements LlmSolutionPlanProvider, LlmSolutionPlanRepairProvider {
    private readonly options;
    constructor(options: AiChatSolutionPlanProviderAdapterOptions);
    planSolution(input: LlmSolutionPlanProviderInput): Promise<unknown>;
    repairSolutionPlan(input: LlmSolutionPlanRepairProviderInput): Promise<unknown>;
    private requestStructuredPlan;
}
//# sourceMappingURL=solution-plan-adapter.d.ts.map