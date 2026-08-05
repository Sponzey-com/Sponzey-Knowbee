import { loadPromptTemplate } from "../memory/knowbee-md.js";
import { loadPromptValue } from "../memory/prompt-fragments.js";
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
function normalizeLine(value) {
    return value?.trim() ?? "";
}
function normalizeList(values) {
    return values
        .map((value) => normalizeLine(value))
        .filter(Boolean);
}
function normalizeRenderedPrompt(value) {
    return value
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
function formatLines(values) {
    return normalizeList(values).join("\n");
}
function formatBulletLines(values) {
    return normalizeList(values).map((value) => `- ${value}`).join("\n");
}
function formatOptionalBlock(title, values) {
    const lines = normalizeList(values);
    if (lines.length === 0)
        return "";
    return [title, ...lines.map((line) => `- ${line}`)].join("\n");
}
function formatOriginalRequestBlock(originalRequest) {
    const normalized = normalizeLine(originalRequest);
    if (!normalized)
        return "";
    return loadPromptValue("structured_execution_original_request_block_user", { originalRequest: normalized });
}
function buildChecklistLines(params) {
    const lines = [
        loadPromptValue("structured_execution_checklist_confirm_goal_user", { target: params.target }),
        params.executionSemantics.filesystemEffect === "mutate"
            ? loadPromptValue("structured_execution_checklist_filesystem_work_user")
            : loadPromptValue("structured_execution_checklist_general_work_user"),
        ...params.completeConditionLines.map((line) => loadPromptValue("structured_execution_checklist_complete_condition_user", { completeCondition: line })),
        params.executionSemantics.artifactDelivery === "direct"
            ? loadPromptValue("structured_execution_checklist_direct_artifact_user", { destination: params.destination })
            : loadPromptValue("structured_execution_checklist_final_result_user", { destination: params.destination }),
        loadPromptValue("structured_execution_checklist_stop_condition_user"),
    ];
    return normalizeList(lines);
}
export function buildStructuredExecutionBrief(params) {
    const target = normalizeLine(params.structuredRequest.target) ||
        loadPromptValue("execution_default_target_user");
    const destination = normalizeLine(params.structuredRequest.to) ||
        loadPromptValue("execution_default_destination_user");
    const contextLines = normalizeList(params.structuredRequest.context);
    const normalizedEnglish = normalizeLine(params.structuredRequest.normalized_english);
    const completeConditionLines = normalizeList(params.structuredRequest.complete_condition);
    const effectiveCompleteConditionLines = completeConditionLines.length > 0
        ? completeConditionLines
        : [loadPromptValue("execution_default_complete_condition_user")];
    const checklistLines = buildChecklistLines({
        target,
        destination,
        completeConditionLines: effectiveCompleteConditionLines,
        executionSemantics: params.executionSemantics,
    });
    return normalizeRenderedPrompt(loadPromptTemplate({
        sourceId: "structured_execution_brief_user",
        variables: {
            header: normalizeLine(params.header),
            introLines: formatLines(params.introLines ?? []),
            originalRequestBlock: formatOriginalRequestBlock(params.originalRequest),
            target,
            destination,
            contextBlock: formatOptionalBlock(structuredExecutionSectionLabel("context_header"), contextLines),
            normalizedEnglishBlock: normalizedEnglish
                ? `${structuredExecutionSectionLabel("normalized_english_header")}\n${normalizedEnglish}`
                : "",
            completeConditions: formatBulletLines(effectiveCompleteConditionLines),
            checklist: checklistLines.join("\n"),
            extraSections: formatLines(params.extraSections ?? []),
            closingLines: formatLines(params.closingLines ?? []),
        },
    }));
}
//# sourceMappingURL=request-prompt.js.map