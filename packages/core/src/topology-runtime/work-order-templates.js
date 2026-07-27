import { loadPromptValue } from "../memory/prompt-fragments.js";
const WORK_ORDER_TEMPLATE_PROMPT_TEXT_SOURCE_ID = "work_order_template_prompt_text_user";
function workOrderTemplatePromptText(key) {
    const entries = loadPromptValue(WORK_ORDER_TEMPLATE_PROMPT_TEXT_SOURCE_ID, {}, { required: true })
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
        throw new Error(`work-order template prompt text missing: ${key}`);
    return value;
}
export const WORK_ORDER_TEMPLATE_CATALOG = {
    schemaVersion: 1,
    templates: [
        {
            templateId: "work-order-template:customer-request-triage",
            labelKo: "고객 요청 분류",
            labelEn: "Customer request triage",
            descriptionKo: "선택한 entry node에서 고객 요청을 분류하고 다음 조치를 정리합니다.",
            descriptionEn: workOrderTemplatePromptText("triage.description"),
            objective: workOrderTemplatePromptText("triage.objective"),
            scopeIncluded: ["customer request", "available topology context", "declared tools"],
            scopeExcluded: ["external write action", "billing mutation"],
            expectedOutputSchema: {
                kind: "object",
                required: ["summary", "priority", "nextAction"],
            },
            successCriteria: [
                {
                    criterionId: "criterion:summary",
                    description: workOrderTemplatePromptText("triage.criterion.summary"),
                    required: true,
                    validationKind: "manual",
                },
                {
                    criterionId: "criterion:next-action",
                    description: workOrderTemplatePromptText("triage.criterion.next_action"),
                    required: true,
                    validationKind: "manual",
                },
            ],
            contextPresets: [
                {
                    id: "context:customer-general",
                    labelKo: "일반 문의",
                    labelEn: "General inquiry",
                    input: {
                        requestKind: "general_inquiry",
                        priorityHint: "normal",
                    },
                },
                {
                    id: "context:customer-urgent",
                    labelKo: "긴급 고객 이슈",
                    labelEn: "Urgent customer issue",
                    input: {
                        requestKind: "urgent_customer_issue",
                        priorityHint: "high",
                    },
                },
            ],
            defaultSimulationMode: "success",
        },
        {
            templateId: "work-order-template:failure-drill",
            labelKo: "실패 경로 점검",
            labelEn: "Failure drill",
            descriptionKo: "FailureReport와 retry/fallback 후보가 overlay에 보이는지 점검합니다.",
            descriptionEn: workOrderTemplatePromptText("failure.description"),
            objective: workOrderTemplatePromptText("failure.objective"),
            scopeIncluded: ["selected node", "failure policy", "recovery policy"],
            scopeExcluded: ["real external delivery"],
            expectedOutputSchema: {
                kind: "object",
                required: ["failureSummary", "recommendedAction"],
            },
            successCriteria: [
                {
                    criterionId: "criterion:failure-summary",
                    description: workOrderTemplatePromptText("failure.criterion.summary"),
                    required: true,
                    validationKind: "manual",
                },
            ],
            contextPresets: [
                {
                    id: "context:missing-data",
                    labelKo: "필수 데이터 누락",
                    labelEn: "Missing required data",
                    input: {
                        requestKind: "failure_drill",
                        missingData: true,
                    },
                },
                {
                    id: "context:tool-timeout",
                    labelKo: "도구 지연",
                    labelEn: "Tool delay",
                    input: {
                        requestKind: "failure_drill",
                        toolDelay: true,
                    },
                },
            ],
            defaultSimulationMode: "failure",
        },
    ],
};
export function getWorkOrderTemplate(templateId) {
    return WORK_ORDER_TEMPLATE_CATALOG.templates.find((template) => template.templateId === templateId)
        ?? WORK_ORDER_TEMPLATE_CATALOG.templates[0];
}
export function getWorkOrderTemplateContext(template, contextPresetId) {
    return template.contextPresets.find((context) => context.id === contextPresetId)
        ?? template.contextPresets[0];
}
//# sourceMappingURL=work-order-templates.js.map