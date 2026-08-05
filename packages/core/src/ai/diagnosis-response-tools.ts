import type { ToolDefinition } from "./types.js"

export const REQUEST_DIAGNOSIS_RESPONSE_TOOL_NAME =
  "submit_request_diagnosis"
export const RESULT_DIAGNOSIS_RESPONSE_TOOL_NAME =
  "submit_result_diagnosis"

const recommendedAction = {
  type: "string",
  enum: [
    "direct_answer",
    "ask_clarification",
    "plan",
    "delegate",
    "use_tool",
    "use_yeonjang",
    "retry",
    "redelegate",
    "partial_report",
    "final_report",
    "stop_blocked",
  ],
}

export const REQUEST_DIAGNOSIS_RESPONSE_TOOL =
  Object.freeze<ToolDefinition>({
    name: REQUEST_DIAGNOSIS_RESPONSE_TOOL_NAME,
    description:
      "Submit the structured request diagnosis. This response tool does not execute work.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        diagnosis_summary: { type: "string", minLength: 1 },
        intent: { type: "string", minLength: 1 },
        goal: { type: "string", minLength: 1 },
        constraints: { type: "array", items: { type: "string" } },
        missing_information: { type: "array", items: { type: "string" } },
        risk: { type: "string" },
        confidence: { type: "string" },
        recommended_action: recommendedAction,
        reason: { type: "string", minLength: 1 },
      },
      required: [
        "diagnosis_summary",
        "intent",
        "goal",
        "constraints",
        "missing_information",
        "risk",
        "confidence",
        "recommended_action",
        "reason",
      ],
    },
  })

export const RESULT_DIAGNOSIS_RESPONSE_TOOL =
  Object.freeze<ToolDefinition>({
    name: RESULT_DIAGNOSIS_RESPONSE_TOOL_NAME,
    description:
      "Submit the structured result diagnosis. This response tool does not execute work.",
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        diagnosis_summary: { type: "string", minLength: 1 },
        sufficiency: {
          type: "string",
          enum: ["sufficient", "partial", "insufficient", "unknown"],
        },
        missing_information: { type: "array", items: { type: "string" } },
        conflicts: { type: "array", items: { type: "string" } },
        risk: { type: "string" },
        risks: { type: "array", items: { type: "string" } },
        confidence: { type: "string" },
        recommended_action: recommendedAction,
        reason: { type: "string", minLength: 1 },
      },
      required: [
        "diagnosis_summary",
        "sufficiency",
        "missing_information",
        "conflicts",
        "risk",
        "risks",
        "confidence",
        "recommended_action",
        "reason",
      ],
    },
  })
