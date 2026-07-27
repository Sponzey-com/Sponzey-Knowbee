export type ConversationRequestKind = "general_conversation" | "simple_question" | "work_request"
export type ConversationAmbiguityImpact = "none" | "low_impact" | "high_impact"
export type ConversationSelectedAction = "direct_answer" | "ask_clarification" | "plan_work"

export interface ConversationDecision {
  requestKind: ConversationRequestKind
  goal: string
  constraints: string[]
  availableContext: string[]
  requiredTools: string[]
  ambiguity: {
    impact: ConversationAmbiguityImpact
    missingFields: string[]
    assumptions: string[]
  }
  selectedAction: ConversationSelectedAction
  clarificationQuestion?: string | undefined
}

export type ConversationDecisionIssue =
  | "goal_required"
  | "direct_answer_action_required"
  | "direct_answer_execution_forbidden"
  | "work_plan_action_required"
  | "high_impact_clarification_required"
  | "high_impact_missing_fields_required"
  | "high_impact_question_required"
  | "low_impact_assumption_required"
  | "low_impact_clarification_forbidden"
  | "no_ambiguity_clarification_forbidden"

export interface ConversationDecisionValidation {
  ok: boolean
  issues: ConversationDecisionIssue[]
}

function hasText(values: string[]): boolean {
  return values.some((value) => value.trim().length > 0)
}

export function validateConversationDecision(decision: ConversationDecision): ConversationDecisionValidation {
  const issues: ConversationDecisionIssue[] = []
  const workRequest = decision.requestKind === "work_request"

  if (!decision.goal.trim()) issues.push("goal_required")

  if (!workRequest) {
    if (decision.selectedAction !== "direct_answer") issues.push("direct_answer_action_required")
    if (decision.requiredTools.length > 0) issues.push("direct_answer_execution_forbidden")
  } else if (decision.ambiguity.impact === "none" && decision.selectedAction !== "plan_work") {
    issues.push("work_plan_action_required")
  }

  if (decision.ambiguity.impact === "high_impact") {
    if (decision.selectedAction !== "ask_clarification") issues.push("high_impact_clarification_required")
    if (!hasText(decision.ambiguity.missingFields)) issues.push("high_impact_missing_fields_required")
    if (!decision.clarificationQuestion?.trim()) issues.push("high_impact_question_required")
  }

  if (decision.ambiguity.impact === "low_impact") {
    if (!hasText(decision.ambiguity.assumptions)) issues.push("low_impact_assumption_required")
    if (decision.selectedAction === "ask_clarification") issues.push("low_impact_clarification_forbidden")
  }

  if (decision.ambiguity.impact === "none" && decision.selectedAction === "ask_clarification") {
    issues.push("no_ambiguity_clarification_forbidden")
  }

  return { ok: issues.length === 0, issues }
}
