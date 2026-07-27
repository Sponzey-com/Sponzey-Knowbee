import { loadPromptValue } from "../memory/prompt-fragments.js";
import { collectStructuredToolAttempt } from "./structured-tool-attempt.js";
import { SOLUTION_PLAN_RESPONSE_TOOL, SOLUTION_PLAN_RESPONSE_TOOL_NAME, } from "./solution-plan-response-tool.js";
export class AiChatSolutionPlanProviderAdapter {
    options;
    constructor(options) {
        this.options = options;
    }
    async planSolution(input) {
        return this.requestStructuredPlan({
            kind: "solution_plan",
            instruction: loadPromptValue("solution_plan_json_instruction_user", {}, {
                required: true,
                ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
            }),
            input,
        });
    }
    async repairSolutionPlan(input) {
        return this.requestStructuredPlan({
            kind: "solution_plan_schema_repair",
            instruction: loadPromptValue("solution_plan_json_instruction_user", {}, {
                required: true,
                ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
            }),
            repair: input,
        });
    }
    async requestStructuredPlan(payload) {
        const chatParams = {
            model: this.options.model,
            system: this.options.solutionPlanPromptSourceBlock,
            messages: [{ role: "user", content: JSON.stringify(payload) }],
            tools: [SOLUTION_PLAN_RESPONSE_TOOL],
            toolChoice: "required",
            ...(this.options.maxTokens === undefined ? {} : { maxTokens: this.options.maxTokens }),
            ...(this.options.observabilityContext
                ? {
                    observability: {
                        ...this.options.observabilityContext,
                        stage: "planning",
                        operationCode: payload.kind === "solution_plan_schema_repair"
                            ? "solution_plan_schema_repair"
                            : "solution_plan",
                    },
                }
                : {}),
        };
        const result = await collectStructuredToolAttempt({
            stream: (signal) => this.options.provider.chat({
                ...chatParams,
                signal,
            }),
            deadlineMs: this.options.deadlineMs ?? 24_000,
            responseToolName: SOLUTION_PLAN_RESPONSE_TOOL_NAME,
            maxTextBytes: 4_096,
            maxToolInputBytes: this.options.maxVisibleTextBytes ?? 65_536,
        });
        if (result.status === "parsed")
            return result.value;
        return { solution_plan_adapter_error: result.status };
    }
}
//# sourceMappingURL=solution-plan-adapter.js.map