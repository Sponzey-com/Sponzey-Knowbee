import { createHash } from "node:crypto";
function normalized(value) {
    return value.trim();
}
function validTextList(value, allowEmpty) {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0))
        return false;
    if (!value.every((item) => typeof item === "string" && normalized(item)))
        return false;
    const values = value.map(normalized);
    return new Set(values).size === values.length;
}
function sameSet(left, right) {
    if (!validTextList(left, true) || !validTextList(right, true))
        return false;
    const leftValues = left.map(normalized).sort();
    const rightValues = right.map(normalized).sort();
    return (leftValues.length === rightValues.length &&
        leftValues.every((value, index) => value === rightValues[index]));
}
function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    return `{${Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
        .join(",")}}`;
}
function fingerprint(decision) {
    const value = createHash("sha256")
        .update(`knowbee:structured-execution-contract:${canonicalize(decision)}`)
        .digest("hex");
    return `sha256:${value}`;
}
function validStep(step) {
    return Boolean(normalized(step.stepId) &&
        normalized(step.ownerAgentName) &&
        validTextList(step.selectedMeans, false) &&
        normalized(step.expectedOutput) &&
        validTextList(step.completionCriteria, false) &&
        validTextList(step.sideEffects, true) &&
        validTextList(step.risks, true) &&
        validTextList(step.requiredApprovals, true) &&
        normalized(step.validationMethod));
}
function structurallyValid(decision) {
    return Boolean(decision?.schemaVersion === 1 &&
        normalized(decision.requestId) &&
        normalized(decision.workId) &&
        normalized(decision.diagnosisReceiptId) &&
        normalized(decision.goal) &&
        validTextList(decision.userConstraints, true) &&
        validTextList(decision.completionCriteria, false) &&
        Array.isArray(decision.steps) &&
        decision.steps.length > 0 &&
        decision.steps.every(validStep) &&
        validTextList(decision.steps.map((step) => step.stepId), false) &&
        normalized(decision.nextActionStepId) &&
        normalized(decision.reason));
}
export function createStructuredExecutionContractReceipt(input) {
    const receiptId = normalized(input.receiptId);
    if (!receiptId)
        throw new Error("Structured execution contract receipt ID is required.");
    return {
        schemaVersion: 1,
        receiptId,
        requestId: normalized(input.decision.requestId),
        workId: normalized(input.decision.workId),
        decisionFingerprint: fingerprint(input.decision),
    };
}
export function admitStructuredExecutionContract(input) {
    if (!structurallyValid(input.decision)) {
        return { status: "rejected", reasonCodes: ["execution_contract_schema_invalid"] };
    }
    const reasonCodes = [];
    if (normalized(input.decision.requestId) !== normalized(input.input.requestId) ||
        normalized(input.decision.workId) !== normalized(input.input.workId) ||
        normalized(input.decision.diagnosisReceiptId) !== normalized(input.input.diagnosisReceiptId))
        reasonCodes.push("execution_scope_mismatch");
    if (normalized(input.decision.goal) !== normalized(input.input.diagnosedGoal)) {
        reasonCodes.push("goal_lineage_mismatch");
    }
    if (!sameSet(input.decision.userConstraints, input.input.diagnosedConstraints)) {
        reasonCodes.push("constraint_lineage_mismatch");
    }
    const stepCriteria = input.decision.steps.flatMap((step) => step.completionCriteria);
    if (!sameSet(input.decision.completionCriteria, input.input.diagnosedCompletionCriteria) ||
        !sameSet(stepCriteria, input.input.diagnosedCompletionCriteria))
        reasonCodes.push("completion_lineage_mismatch");
    if (!input.decision.steps.some((step) => normalized(step.stepId) === normalized(input.decision.nextActionStepId))) {
        reasonCodes.push("next_action_step_missing");
    }
    if (!input.receipt || !normalized(input.receipt.receiptId)) {
        reasonCodes.push("execution_contract_receipt_missing");
    }
    else if (input.receipt.schemaVersion !== 1 ||
        normalized(input.receipt.requestId) !== normalized(input.decision.requestId) ||
        normalized(input.receipt.workId) !== normalized(input.decision.workId) ||
        input.receipt.decisionFingerprint !== fingerprint(input.decision))
        reasonCodes.push("execution_contract_receipt_mismatch");
    if (reasonCodes.length > 0 || !input.receipt) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        status: "admitted",
        requestId: normalized(input.decision.requestId),
        workId: normalized(input.decision.workId),
        goal: input.decision.goal,
        userConstraints: [...input.decision.userConstraints],
        completionCriteria: [...input.decision.completionCriteria],
        stepIds: input.decision.steps.map((step) => step.stepId),
        nextActionStepId: input.decision.nextActionStepId,
        receiptId: input.receipt.receiptId,
    };
}
//# sourceMappingURL=structured-execution-contract.js.map