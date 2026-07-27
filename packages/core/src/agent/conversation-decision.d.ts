export type ConversationRequestKind = "general_conversation" | "simple_question" | "work_request";
export type ConversationAmbiguityImpact = "none" | "low_impact" | "high_impact";
export type ConversationSelectedAction = "direct_answer" | "ask_clarification" | "plan_work";
export interface ConversationDecision {
    requestKind: ConversationRequestKind;
    goal: string;
    constraints: string[];
    availableContext: string[];
    requiredTools: string[];
    ambiguity: {
        impact: ConversationAmbiguityImpact;
        missingFields: string[];
        assumptions: string[];
    };
    selectedAction: ConversationSelectedAction;
    clarificationQuestion?: string | undefined;
}
export type ConversationDecisionIssue = "goal_required" | "direct_answer_action_required" | "direct_answer_execution_forbidden" | "work_plan_action_required" | "high_impact_clarification_required" | "high_impact_missing_fields_required" | "high_impact_question_required" | "low_impact_assumption_required" | "low_impact_clarification_forbidden" | "no_ambiguity_clarification_forbidden";
export interface ConversationDecisionValidation {
    ok: boolean;
    issues: ConversationDecisionIssue[];
}
export declare function validateConversationDecision(decision: ConversationDecision): ConversationDecisionValidation;
//# sourceMappingURL=conversation-decision.d.ts.map