import type { ToolDefinition } from "./types.js"

export const SOLUTION_PLAN_RESPONSE_TOOL_NAME = "submit_solution_plan"

export const SOLUTION_PLAN_RESPONSE_TOOL = Object.freeze<ToolDefinition>({
  name: SOLUTION_PLAN_RESPONSE_TOOL_NAME,
  description:
    "Submit the complete structured solution plan for harness validation. This tool does not execute work.",
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
              minItems: 1,
              items: { type: "string", minLength: 1 },
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
})
