function hasText(values) {
    return values.some((value) => value.trim().length > 0);
}
export function validateConversationDecision(decision) {
    const issues = [];
    const workRequest = decision.requestKind === "work_request";
    if (!decision.goal.trim())
        issues.push("goal_required");
    if (!workRequest) {
        if (decision.selectedAction !== "direct_answer")
            issues.push("direct_answer_action_required");
        if (decision.requiredTools.length > 0)
            issues.push("direct_answer_execution_forbidden");
    }
    else if (decision.ambiguity.impact === "none" && decision.selectedAction !== "plan_work") {
        issues.push("work_plan_action_required");
    }
    if (decision.ambiguity.impact === "high_impact") {
        if (decision.selectedAction !== "ask_clarification")
            issues.push("high_impact_clarification_required");
        if (!hasText(decision.ambiguity.missingFields))
            issues.push("high_impact_missing_fields_required");
        if (!decision.clarificationQuestion?.trim())
            issues.push("high_impact_question_required");
    }
    if (decision.ambiguity.impact === "low_impact") {
        if (!hasText(decision.ambiguity.assumptions))
            issues.push("low_impact_assumption_required");
        if (decision.selectedAction === "ask_clarification")
            issues.push("low_impact_clarification_forbidden");
    }
    if (decision.ambiguity.impact === "none" && decision.selectedAction === "ask_clarification") {
        issues.push("no_ambiguity_clarification_forbidden");
    }
    return { ok: issues.length === 0, issues };
}
//# sourceMappingURL=conversation-decision.js.map