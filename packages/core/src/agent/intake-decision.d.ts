export type IntakeDecisionConsistencyIssue = "clarification_receipt_mismatch" | "clarification_action_count_invalid" | "clarification_missing_fields_empty" | "clarification_question_missing" | "clarification_question_too_long" | "clarification_internal_term_exposed" | "clarification_execution_conflict" | "non_clarification_receipt_mismatch" | "non_clarification_ask_user_forbidden" | "direct_answer_receipt_mismatch" | "direct_answer_action_invalid" | "direct_answer_execution_conflict" | "task_intake_receipt_mismatch" | "task_intake_action_missing" | "task_intake_execution_missing" | "execution_approval_requires_privileged_operation" | "execution_privileged_operation_requires_tools" | "execution_specific_approval_tool_requires_privileged_operation" | "execution_specific_approval_tool_requires_approval" | "execution_specific_approval_tool_method_mismatch" | "execution_generic_approval_tool_method_missing" | "model_failed_receipt_forbidden";
export interface IntakeDecisionConsistencyInput {
    intent: {
        category: string;
    };
    userMessage: {
        mode: string;
        text: string;
    };
    actionItems: ReadonlyArray<{
        type: string;
        payload: Record<string, unknown>;
    }>;
    execution: {
        requires_run: boolean;
        requires_delegation: boolean;
        needs_tools?: boolean;
        execution_semantics?: {
            privilegedOperation: "none" | "required";
            approvalRequired: boolean;
            approvalTool: string;
        };
    };
}
export interface IntakeDecisionConsistencyResult {
    ok: boolean;
    issues: IntakeDecisionConsistencyIssue[];
}
/**
 * Validates cross-field intake invariants before policy admission. A purpose-specific approval
 * Tool and explicit method constraints must describe the same executable effect; disagreement
 * is returned as typed repair evidence and never corrected by string or semantic heuristics.
 */
export declare function validateIntakeDecisionConsistency(input: IntakeDecisionConsistencyInput): IntakeDecisionConsistencyResult;
//# sourceMappingURL=intake-decision.d.ts.map