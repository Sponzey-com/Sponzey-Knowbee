import { validateWorkRecordActionGate, } from "./work-record.js";
function issue(code, path, validationIssues) {
    return {
        code,
        ...(path ? { path } : {}),
        ...(validationIssues ? {
            validationIssues: validationIssues.map((item) => ({
                path: item.path,
                code: item.code,
                message: item.message,
            })),
        } : {}),
    };
}
function sameDiagnosis(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}
function validStepContract(step) {
    return Boolean(step.step_id.trim() &&
        step.owner_agent_name.trim() &&
        step.input_refs.length > 0 &&
        step.input_refs.every((reference) => reference.trim()) &&
        step.expected_output.trim() &&
        step.completion_criteria.trim());
}
export function decideStructuredWorkDecisionReadiness(input) {
    if (input.workRecord === undefined || input.workRecord === null) {
        return { status: "rejected", issues: [issue("structured_work_record_required", "$.workRecord")] };
    }
    const validation = validateWorkRecordActionGate(input.workRecord, input.phase);
    if (!validation.ok) {
        return {
            status: "rejected",
            issues: [issue("work_record_schema_invalid", "$.workRecord", validation.issues)],
        };
    }
    const record = validation.value;
    const issues = [];
    if (input.plan.workId !== record.work_id || input.plan.ownerAgentName !== record.owner_agent_name) {
        issues.push(issue("work_plan_scope_mismatch", "$.plan"));
    }
    if (input.plan.classification === "complex" && input.plan.steps.length < 2) {
        issues.push(issue("complex_step_count_invalid", "$.plan.steps"));
    }
    input.plan.steps.forEach((step, index) => {
        if (!validStepContract(step))
            issues.push(issue("step_contract_invalid", `$.plan.steps[${index}]`));
    });
    const recordSteps = new Map(record.step_plan.map((step) => [step.step_id, step]));
    if (recordSteps.size !== input.plan.steps.length ||
        input.plan.steps.some((step) => {
            const canonical = recordSteps.get(step.step_id);
            return !canonical ||
                canonical.owner_agent_name !== step.owner_agent_name ||
                canonical.expected_output !== step.expected_output ||
                canonical.completion_criteria !== step.completion_criteria;
        })) {
        issues.push(issue("step_plan_mismatch", "$.plan.steps"));
    }
    const expectedTarget = input.phase === "request" ? "request_diagnosis" : "result_diagnosis";
    if (input.diagnosisGate.status !== "valid") {
        issues.push(issue("diagnosis_not_schema_valid", "$.diagnosisGate"));
    }
    else {
        if (input.diagnosisGate.target !== expectedTarget) {
            issues.push(issue("diagnosis_target_mismatch", "$.diagnosisGate.target"));
        }
        if (!input.diagnosisGate.receipt) {
            issues.push(issue("diagnosis_receipt_required", "$.diagnosisGate.receipt"));
        }
        const recordDiagnosis = input.phase === "request"
            ? record.request_diagnosis
            : record.result_diagnosis;
        if (!sameDiagnosis(input.diagnosisGate.diagnosis, recordDiagnosis)) {
            issues.push(issue("diagnosis_record_mismatch", "$.diagnosisGate.diagnosis"));
        }
        if (input.diagnosisGate.diagnosis.recommended_action !== input.selectedAction) {
            issues.push(issue("diagnosis_action_mismatch", "$.selectedAction"));
        }
    }
    if (record.action_decision.selected_action !== input.selectedAction) {
        issues.push(issue("selected_action_mismatch", "$.selectedAction"));
    }
    if (issues.length > 0 || input.diagnosisGate.status !== "valid" || !input.diagnosisGate.receipt) {
        return { status: "rejected", issues };
    }
    return {
        status: "ready",
        workId: record.work_id,
        phase: input.phase,
        classification: input.plan.classification,
        stepIds: input.plan.steps.map((step) => step.step_id),
        diagnosisReceiptId: input.diagnosisGate.receipt.receiptId,
        selectedAction: input.selectedAction,
    };
}
//# sourceMappingURL=structured-work-decision-readiness.js.map