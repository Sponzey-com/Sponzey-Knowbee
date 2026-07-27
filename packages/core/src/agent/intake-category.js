export const TASK_INTAKE_INTENT_CATEGORIES = [
    "direct_answer",
    "task_intake",
    "schedule_request",
    "clarification",
];
const TASK_INTAKE_INTENT_CATEGORY_SET = new Set(TASK_INTAKE_INTENT_CATEGORIES);
export function isTaskIntakeIntentCategory(value) {
    return typeof value === "string" && TASK_INTAKE_INTENT_CATEGORY_SET.has(value);
}
//# sourceMappingURL=intake-category.js.map