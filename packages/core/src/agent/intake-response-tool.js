import { TASK_INTAKE_INTENT_CATEGORIES } from "./intake-category.js";
export const TASK_INTAKE_RESPONSE_TOOL_NAME = "submit_task_intake";
const stringSchema = { type: "string" };
const nullableStringSchema = { type: ["string", "null"] };
const stringArraySchema = {
    type: "array",
    items: stringSchema,
};
const methodIdentifierSchema = {
    type: "string",
    pattern: "^[a-z][a-z0-9_.:-]{0,127}$",
    description: "An exact stable capability identifier from the runtime capability contract; never prose, an instruction, or an invented identifier.",
};
const methodIdentifierArraySchema = {
    type: "array",
    items: methodIdentifierSchema,
};
const preferredMethodIdentifierArraySchema = {
    ...methodIdentifierArraySchema,
    description: "Exact capabilities selected for this action, in execution priority order. Preserve a user-named method first; otherwise select the most purpose-specific available capability before any generic executor.",
};
const exclusiveMethodIdentifierArraySchema = {
    ...methodIdentifierArraySchema,
    description: "Exact capabilities the user explicitly required while forbidding alternatives. Leave empty unless the user imposed this restriction.",
};
const targetInstanceSchema = {
    type: ["string", "null"],
    pattern: "^[a-z][a-z0-9_.:-]{0,127}$",
    description: "An exact stable target instance identifier explicitly supplied by the user. Use null when the user did not supply one.",
};
function closedObjectSchema(properties, required = Object.keys(properties)) {
    return {
        type: "object",
        additionalProperties: false,
        properties,
        required,
    };
}
function actionSchema(type, payload) {
    return closedObjectSchema({
        id: stringSchema,
        type: { type: "string", enum: [type] },
        title: stringSchema,
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        reason: stringSchema,
        payload,
    });
}
const followupRunPayloadSchema = closedObjectSchema({
    goal: nullableStringSchema,
    literal_text: nullableStringSchema,
    destination: nullableStringSchema,
    task_profile: nullableStringSchema,
    preferred_target: nullableStringSchema,
});
const taskPayloadSchema = closedObjectSchema({
    goal: stringSchema,
    task: nullableStringSchema,
    context: nullableStringSchema,
    success_criteria: stringArraySchema,
    constraints: stringArraySchema,
    assumptions: stringArraySchema,
    task_profile: nullableStringSchema,
    preferred_target: nullableStringSchema,
    target_instance: targetInstanceSchema,
    preferred_methods: preferredMethodIdentifierArraySchema,
    exclusive_methods: exclusiveMethodIdentifierArraySchema,
});
const schedulePayloadProperties = {
    title: stringSchema,
    task: stringSchema,
    cron: nullableStringSchema,
    run_at: nullableStringSchema,
    schedule_text: stringSchema,
    timezone: nullableStringSchema,
    literal_text: nullableStringSchema,
    followup_run_payload: followupRunPayloadSchema,
};
const actionItemSchema = {
    anyOf: [
        actionSchema("reply", closedObjectSchema({ content: stringSchema })),
        actionSchema("run_task", taskPayloadSchema),
        actionSchema("delegate_agent", closedObjectSchema({
            goal: stringSchema,
            context: nullableStringSchema,
            success_criteria: stringArraySchema,
            constraints: stringArraySchema,
            assumptions: stringArraySchema,
            preferred_target: nullableStringSchema,
            target_instance: targetInstanceSchema,
            preferred_methods: preferredMethodIdentifierArraySchema,
            exclusive_methods: exclusiveMethodIdentifierArraySchema,
        })),
        actionSchema("create_schedule", closedObjectSchema(schedulePayloadProperties)),
        actionSchema("update_schedule", closedObjectSchema({
            schedule_ids: stringArraySchema,
            ...schedulePayloadProperties,
        })),
        actionSchema("cancel_schedule", closedObjectSchema({
            schedule_ids: stringArraySchema,
        })),
        actionSchema("ask_user", closedObjectSchema({
            question: stringSchema,
            missing_fields: stringArraySchema,
        })),
        actionSchema("log_only", closedObjectSchema({
            content: stringSchema,
        })),
    ],
};
export const TASK_INTAKE_RESPONSE_TOOL = Object.freeze({
    name: TASK_INTAKE_RESPONSE_TOOL_NAME,
    description: "Submit exactly one validated task-intake decision and user-facing response.",
    input_schema: {
        type: "object",
        additionalProperties: false,
        properties: {
            intent: {
                type: "object",
                additionalProperties: false,
                required: ["category", "summary", "confidence"],
                properties: {
                    category: {
                        type: "string",
                        enum: TASK_INTAKE_INTENT_CATEGORIES,
                    },
                    summary: { type: "string" },
                    confidence: { type: "number" },
                },
            },
            user_message: {
                type: "object",
                additionalProperties: false,
                required: ["mode", "text"],
                properties: {
                    mode: {
                        type: "string",
                        enum: [
                            "direct_answer",
                            "accepted_receipt",
                            "clarification_receipt",
                        ],
                    },
                    text: { type: "string" },
                },
            },
            identity_claim: {
                type: "object",
                additionalProperties: false,
                required: ["subject", "claimed_name"],
                properties: {
                    subject: { type: "string", enum: ["none", "main_agent", "user"] },
                    claimed_name: { type: "string" },
                },
            },
            action_items: {
                type: "array",
                items: actionItemSchema,
            },
            structured_request: {
                type: "object",
                additionalProperties: false,
                properties: {
                    source_language: { type: "string", enum: ["ko", "en", "unknown"] },
                    response_language_mode: {
                        type: "string",
                        enum: ["same_as_request", "translation", "language_comparison", "multilingual"],
                    },
                    normalized_english: stringSchema,
                    target: stringSchema,
                    to: stringSchema,
                    context: stringArraySchema,
                    complete_condition: stringArraySchema,
                },
                required: [
                    "source_language",
                    "response_language_mode",
                    "normalized_english",
                    "target",
                    "to",
                    "context",
                    "complete_condition",
                ],
            },
            scheduling: {
                type: "object",
                additionalProperties: false,
                required: ["detected", "kind", "status", "schedule_text"],
                properties: {
                    detected: { type: "boolean" },
                    kind: { type: "string", enum: ["one_time", "recurring", "none"] },
                    status: {
                        type: "string",
                        enum: ["accepted", "failed", "needs_clarification", "not_applicable"],
                    },
                    schedule_text: { type: "string" },
                    cron: { type: "string" },
                    run_at: { type: "string" },
                    failure_reason: { type: "string" },
                },
            },
            execution: {
                type: "object",
                additionalProperties: false,
                required: [
                    "requires_run",
                    "requires_delegation",
                    "suggested_target",
                    "max_delegation_turns",
                    "needs_tools",
                    "needs_web",
                    "execution_semantics",
                ],
                properties: {
                    requires_run: { type: "boolean" },
                    requires_delegation: { type: "boolean" },
                    suggested_target: { type: "string" },
                    max_delegation_turns: { type: "number" },
                    needs_tools: { type: "boolean" },
                    needs_web: { type: "boolean" },
                    execution_semantics: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                            filesystem_effect: { type: "string", enum: ["none", "mutate"] },
                            privileged_operation: { type: "string", enum: ["none", "required"] },
                            artifact_delivery: { type: "string", enum: ["none", "direct"] },
                            approval_required: { type: "boolean" },
                            approval_tool: {
                                type: "string",
                                description: "Select the purpose-specific capability for the primary approved effect. Camera capture: yeonjang_camera_capture. Screen capture: screen_capture. Use external_action only when no purpose-specific value applies; never replace a listed capability with a generic shell or process executor.",
                                enum: [
                                    "screen_capture",
                                    "yeonjang_camera_capture",
                                    "mouse_click",
                                    "keyboard_type",
                                    "file_write",
                                    "app_launch",
                                    "external_action",
                                ],
                            },
                        },
                        required: [
                            "filesystem_effect",
                            "privileged_operation",
                            "artifact_delivery",
                            "approval_required",
                            "approval_tool",
                        ],
                    },
                },
            },
            notes: {
                type: "array",
                items: { type: "string" },
            },
        },
        required: [
            "intent",
            "user_message",
            "identity_claim",
            "action_items",
            "scheduling",
            "execution",
        ],
    },
});
//# sourceMappingURL=intake-response-tool.js.map