export const SOLUTION_PLAN_RESPONSE_TOOL_NAME = "submit_solution_plan";
export const SOLUTION_PLAN_RESPONSE_TOOL = Object.freeze({
    name: SOLUTION_PLAN_RESPONSE_TOOL_NAME,
    description: "Submit the complete structured solution plan for harness validation. This tool does not execute work.",
    input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            ownerAgentName: { type: "string", minLength: 1 },
            steps: {
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        step_id: { type: "string", minLength: 1 },
                        owner_agent_name: { type: "string", minLength: 1 },
                        action_type: {
                            type: "string",
                            enum: [
                                "direct_answer",
                                "plan",
                                "delegate",
                                "use_tool",
                                "use_yeonjang",
                                "ask_clarification",
                                "validate",
                                "report",
                            ],
                        },
                        input_refs: {
                            type: "array",
                            description: "Input references for this step. Every use_tool or use_yeonjang step must include exactly one provided capability reference. Use the matching approved_capability or approval_tool constraint for the requested side effect instead of an unapproved generic side-effect capability; validation and reporting steps must use their non-Tool action types.",
                            minItems: 1,
                            items: {
                                type: "string",
                                minLength: 1,
                                description: "Copy capability references exactly from the provided solution-plan input.",
                            },
                        },
                        expected_output: { type: "string", minLength: 1 },
                        completion_criteria: { type: "string", minLength: 1 },
                        status: { type: "string", enum: ["pending"] },
                    },
                    required: [
                        "step_id",
                        "owner_agent_name",
                        "action_type",
                        "input_refs",
                        "expected_output",
                        "completion_criteria",
                        "status",
                    ],
                },
            },
        },
        required: ["ownerAgentName", "steps"],
    },
});
//# sourceMappingURL=solution-plan-response-tool.js.map