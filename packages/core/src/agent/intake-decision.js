const INTERNAL_INTAKE_TERM = /\b(?:agent_id|node_id|missing_fields|structured_request|intent_envelope|recommended_action|schema)\b/iu;
export function validateIntakeDecisionConsistency(input) {
    const issues = [];
    const askUserActions = input.actionItems.filter((action) => action.type === "ask_user");
    if (input.userMessage.mode === "failed_receipt") {
        issues.push("model_failed_receipt_forbidden");
    }
    if (input.intent.category === "clarification") {
        if (input.userMessage.mode !== "clarification_receipt")
            issues.push("clarification_receipt_mismatch");
        if (askUserActions.length !== 1 || input.actionItems.length !== 1)
            issues.push("clarification_action_count_invalid");
        if (input.execution.requires_run || input.execution.requires_delegation)
            issues.push("clarification_execution_conflict");
        const action = askUserActions[0];
        const question = typeof action?.payload.question === "string"
            ? action.payload.question.trim()
            : input.userMessage.text.trim();
        const missingFields = action?.payload.missing_fields;
        if (!Array.isArray(missingFields) || !missingFields.some((field) => typeof field === "string" && field.trim())) {
            issues.push("clarification_missing_fields_empty");
        }
        if (!question || !input.userMessage.text.trim())
            issues.push("clarification_question_missing");
        if (question.length > 400 || input.userMessage.text.trim().length > 400)
            issues.push("clarification_question_too_long");
        if (INTERNAL_INTAKE_TERM.test(question) || INTERNAL_INTAKE_TERM.test(input.userMessage.text)) {
            issues.push("clarification_internal_term_exposed");
        }
    }
    else {
        if (input.userMessage.mode === "clarification_receipt")
            issues.push("non_clarification_receipt_mismatch");
        if (askUserActions.length > 0)
            issues.push("non_clarification_ask_user_forbidden");
    }
    if (input.intent.category === "direct_answer") {
        const replyActions = input.actionItems.filter((action) => action.type === "reply");
        if (input.userMessage.mode !== "direct_answer")
            issues.push("direct_answer_receipt_mismatch");
        if (input.actionItems.length > 1 || input.actionItems.some((action) => action.type !== "reply")) {
            issues.push("direct_answer_action_invalid");
        }
        if (replyActions.length === 1) {
            const content = replyActions[0]?.payload.content;
            if (typeof content !== "string" || !content.trim())
                issues.push("direct_answer_action_invalid");
        }
        if (input.execution.requires_run || input.execution.requires_delegation) {
            issues.push("direct_answer_execution_conflict");
        }
    }
    if (input.intent.category === "task_intake") {
        const executionActions = input.actionItems.filter((action) => action.type === "run_task" || action.type === "delegate_agent");
        if (input.userMessage.mode !== "accepted_receipt")
            issues.push("task_intake_receipt_mismatch");
        if (executionActions.length === 0)
            issues.push("task_intake_action_missing");
        if (!input.execution.requires_run)
            issues.push("task_intake_execution_missing");
    }
    const executionSemantics = input.execution.execution_semantics;
    if (executionSemantics) {
        const privilegedOperationRequired = executionSemantics.privilegedOperation === "required";
        const specificApprovalTool = Boolean(executionSemantics.approvalTool.trim()) &&
            executionSemantics.approvalTool !== "external_action";
        if (executionSemantics.approvalRequired && !privilegedOperationRequired) {
            issues.push("execution_approval_requires_privileged_operation");
        }
        else if (specificApprovalTool && !privilegedOperationRequired) {
            issues.push("execution_specific_approval_tool_requires_privileged_operation");
        }
        if (privilegedOperationRequired && input.execution.needs_tools === false) {
            issues.push("execution_privileged_operation_requires_tools");
        }
        if (specificApprovalTool && !executionSemantics.approvalRequired) {
            issues.push("execution_specific_approval_tool_requires_approval");
        }
    }
    return { ok: issues.length === 0, issues };
}
//# sourceMappingURL=intake-decision.js.map