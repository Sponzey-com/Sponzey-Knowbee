import { loadPromptValue } from "../memory/prompt-fragments.js";
import { collectStructuredToolAttempt } from "./structured-tool-attempt.js";
import { SOLUTION_PLAN_RESPONSE_TOOL, SOLUTION_PLAN_RESPONSE_TOOL_NAME, } from "./solution-plan-response-tool.js";
function normalizedCapabilityRefs(values) {
    return [
        ...new Set(values
            .map((value) => value.trim())
            .filter(Boolean)
            .map((value) => value.startsWith("capability:") ? value : `capability:${value}`)),
    ].sort();
}
function capabilityBoundSolutionPlanResponseTool(capabilityRefs, requiredCapabilityRefs) {
    const refs = normalizedCapabilityRefs(capabilityRefs);
    const requiredRefs = normalizedCapabilityRefs(requiredCapabilityRefs);
    if (refs.length === 0)
        return SOLUTION_PLAN_RESPONSE_TOOL;
    const inputSchema = structuredClone(SOLUTION_PLAN_RESPONSE_TOOL.input_schema);
    const stepsSchema = inputSchema.properties.steps;
    const stepSchema = stepsSchema.items;
    if (!stepSchema) {
        throw new Error("Solution-plan response Tool step schema is required.");
    }
    stepSchema.properties.capability_ref = {
        type: "string",
        enum: refs,
        description: "Select the one provided capability reference used by this step. "
            + "Every requiredCapabilityRefs value must be selected by at least one use_tool or use_yeonjang step. "
            + `Required values: ${requiredRefs.join(", ") || "(none)"}.`,
    };
    stepSchema.required = [...new Set([...stepSchema.required, "capability_ref"])];
    return {
        ...SOLUTION_PLAN_RESPONSE_TOOL,
        input_schema: inputSchema,
    };
}
function materializeSelectedCapabilityRefs(value) {
    const normalized = structuredClone(value);
    if (!Array.isArray(normalized.steps))
        return normalized;
    for (const candidate of normalized.steps) {
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
            continue;
        const step = candidate;
        const capabilityRef = typeof step.capability_ref === "string"
            ? step.capability_ref.trim()
            : "";
        delete step.capability_ref;
        if (!capabilityRef ||
            (step.action_type !== "use_tool" &&
                step.action_type !== "use_yeonjang")) {
            continue;
        }
        const inputRefs = Array.isArray(step.input_refs)
            ? step.input_refs.filter((reference) => typeof reference === "string" && Boolean(reference.trim()))
            : [];
        step.input_refs = [
            ...new Set([
                ...inputRefs.map((reference) => reference.trim()),
                capabilityRef,
            ]),
        ];
    }
    return normalized;
}
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
        }, input.capabilityRefs, input.requiredCapabilityRefs ?? []);
    }
    async repairSolutionPlan(input) {
        return this.requestStructuredPlan({
            kind: "solution_plan_schema_repair",
            instruction: loadPromptValue("solution_plan_json_instruction_user", {}, {
                required: true,
                ...(this.options.workDir === undefined ? {} : { workDir: this.options.workDir }),
            }),
            repair: input,
        }, input.subject.capabilityRefs, input.subject.requiredCapabilityRefs ?? []);
    }
    async requestStructuredPlan(payload, capabilityRefs, requiredCapabilityRefs) {
        const chatParams = {
            model: this.options.model,
            system: this.options.solutionPlanPromptSourceBlock,
            messages: [{ role: "user", content: JSON.stringify(payload) }],
            tools: [
                capabilityBoundSolutionPlanResponseTool(capabilityRefs, requiredCapabilityRefs),
            ],
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
            return materializeSelectedCapabilityRefs(result.value);
        return { solution_plan_adapter_error: result.status };
    }
}
//# sourceMappingURL=solution-plan-adapter.js.map