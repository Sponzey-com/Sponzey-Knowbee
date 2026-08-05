export const TASK_INTAKE_INTENT_CATEGORIES = [
  "direct_answer",
  "task_intake",
  "schedule_request",
  "clarification",
] as const

export type TaskIntakeIntentCategory = (typeof TASK_INTAKE_INTENT_CATEGORIES)[number]

const TASK_INTAKE_INTENT_CATEGORY_SET = new Set<string>(TASK_INTAKE_INTENT_CATEGORIES)

export function isTaskIntakeIntentCategory(
  value: unknown,
): value is TaskIntakeIntentCategory {
  return typeof value === "string" && TASK_INTAKE_INTENT_CATEGORY_SET.has(value)
}
