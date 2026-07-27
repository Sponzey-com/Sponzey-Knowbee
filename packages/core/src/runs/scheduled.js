import { buildStructuredExecutionBrief } from "./request-prompt.js";
import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
const SCHEDULED_SOURCE_IDS = {
    defaultDestination: "scheduled_default_destination_user",
    structuredRequestHeader: "scheduled_structured_request_header_user",
    contextTaskPayload: "scheduled_context_task_payload_user",
    contextTaskProfile: "scheduled_context_task_profile_user",
    contextTimeReached: "scheduled_context_time_reached_user",
    completeTimeReached: "scheduled_complete_time_reached_user",
    completeDestination: "scheduled_complete_destination_user",
};
const STRUCTURED_EXECUTION_SECTION_LABELS_SOURCE_ID = "structured_execution_section_labels_user";
function structuredExecutionSectionLabel(key, variables = {}) {
    const entries = loadPromptValue(STRUCTURED_EXECUTION_SECTION_LABELS_SOURCE_ID, variables, { required: true })
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0)
            return [line, ""];
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
    });
    const value = new Map(entries).get(key);
    if (!value)
        throw new Error(`structured execution section label missing: ${key}`);
    return value;
}
export function shouldDisableToolsForScheduledTask(task, taskProfile, executionSemantics) {
    void task;
    void taskProfile;
    if (!executionSemantics)
        return false;
    return executionSemantics.filesystemEffect === "none"
        && executionSemantics.privilegedOperation === "none"
        && executionSemantics.artifactDelivery !== "direct";
}
export function getScheduledRunExecutionOptions(task, taskProfile, executionSemantics) {
    return {
        toolsEnabled: !shouldDisableToolsForScheduledTask(task, taskProfile, executionSemantics),
        contextMode: "isolated",
    };
}
export function extractDirectChannelDeliveryText(task) {
    void task;
    return null;
}
function buildScheduledStructuredRequest(params) {
    const target = params.goal.trim();
    const destination = params.destination?.trim()
        || loadPromptValue(SCHEDULED_SOURCE_IDS.defaultDestination, {}, { required: true });
    const contextLines = [
        loadPromptValue(SCHEDULED_SOURCE_IDS.contextTaskPayload, { task: params.task.trim() }, { required: true }),
        loadPromptValue(SCHEDULED_SOURCE_IDS.contextTaskProfile, { taskProfile: params.taskProfile.trim() }, { required: true }),
        loadPromptValue(SCHEDULED_SOURCE_IDS.contextTimeReached, {}, { required: true }),
    ].filter(Boolean);
    const completeConditionLines = [
        loadPromptValue(SCHEDULED_SOURCE_IDS.completeTimeReached, {}, { required: true }),
        loadPromptValue(SCHEDULED_SOURCE_IDS.completeDestination, { destination }, { required: true }),
    ];
    return buildStructuredExecutionBrief({
        header: loadPromptValue(SCHEDULED_SOURCE_IDS.structuredRequestHeader, {}, { required: true }),
        structuredRequest: {
            source_language: "unknown",
            normalized_english: [
                `${structuredExecutionSectionLabel("target_label")} ${target}`,
                `${structuredExecutionSectionLabel("to_label")} ${destination}`,
                `${structuredExecutionSectionLabel("context_label")} ${contextLines.join(" | ")}`,
                `${structuredExecutionSectionLabel("complete_condition_label")} ${completeConditionLines.join(" | ")}`,
            ].join("\n"),
            target,
            to: destination,
            context: contextLines,
            complete_condition: completeConditionLines,
        },
        executionSemantics: {
            filesystemEffect: "none",
            privilegedOperation: "none",
            artifactDelivery: "none",
            approvalRequired: false,
            approvalTool: "external_action",
        },
    });
}
function normalizeScheduledPrompt(value) {
    return value
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
function buildPreferredTargetBlock(preferredTarget) {
    if (!preferredTarget)
        return "";
    return `${structuredExecutionSectionLabel("preferred_target_header")}\n${preferredTarget}`;
}
function buildScheduledToolInstruction(toolsEnabled) {
    return loadPromptTemplate({
        sourceId: toolsEnabled
            ? "scheduled_tool_enabled_instruction_user"
            : "scheduled_tool_disabled_instruction_user",
    }).trim();
}
export function buildScheduledFollowupPrompt(params) {
    const goal = params.goal?.trim() || params.task.trim();
    const taskProfile = params.taskProfile?.trim() || "general_chat";
    const preferredTarget = params.preferredTarget?.trim();
    return normalizeScheduledPrompt(loadPromptTemplate({
        sourceId: "scheduled_followup_user",
        variables: {
            structuredRequest: buildScheduledStructuredRequest({
                task: params.task,
                goal,
                taskProfile,
                ...(params.destination ? { destination: params.destination } : {}),
            }),
            preferredTargetBlock: buildPreferredTargetBlock(preferredTarget),
            toolInstruction: buildScheduledToolInstruction(params.toolsEnabled),
        },
    }));
}
//# sourceMappingURL=scheduled.js.map