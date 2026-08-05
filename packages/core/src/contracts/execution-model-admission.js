import { createHash } from "node:crypto";
function normalized(value) {
    return value.trim();
}
function uniqueText(values) {
    const normalizedValues = values.map(normalized);
    return normalizedValues.every(Boolean) && new Set(normalizedValues).size === values.length;
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
        .update(`knowbee:execution-model:${canonicalize(decision)}`)
        .digest("hex");
    return `sha256:${value}`;
}
function structurallyValid(input, decision) {
    return Boolean(normalized(input.requestId) &&
        normalized(input.workId) &&
        normalized(input.executionContractReceiptId) &&
        Array.isArray(input.steps) &&
        input.steps.length > 0 &&
        uniqueText(input.steps.map((step) => step.stepId)) &&
        input.steps.every((step) => ["direct_response", "read", "write", "external", "delegate", "validate"].includes(step.actionKind) &&
            ["none", "write", "external", "destructive"].includes(step.sideEffect) &&
            typeof step.requiresApproval === "boolean" &&
            typeof step.retryOrReentryPossible === "boolean") &&
        Array.isArray(input.executionReceipts) &&
        typeof input.completionRequested === "boolean" &&
        decision?.schemaVersion === 1 &&
        normalized(decision.requestId) &&
        normalized(decision.workId) &&
        normalized(decision.executionContractReceiptId) &&
        ["direct_sequential", "safe_read_sequential", "managed_state_machine"].includes(decision.selectedMode) &&
        normalized(decision.reason));
}
function requiredMode(steps) {
    const step = steps[0];
    const simple = steps.length === 1 &&
        step?.sideEffect === "none" &&
        !step.requiresApproval &&
        !step.retryOrReentryPossible;
    if (simple && step.actionKind === "direct_response")
        return "direct_sequential";
    if (simple && step.actionKind === "read")
        return "safe_read_sequential";
    return "managed_state_machine";
}
export function createExecutionModelReceipt(input) {
    const receiptId = normalized(input.receiptId);
    if (!receiptId)
        throw new Error("Execution model receipt ID is required.");
    return {
        schemaVersion: 1,
        receiptId,
        requestId: normalized(input.decision.requestId),
        workId: normalized(input.decision.workId),
        decisionFingerprint: fingerprint(input.decision),
    };
}
export function admitExecutionModel(input) {
    if (!structurallyValid(input.input, input.decision)) {
        return { status: "rejected", reasonCodes: ["execution_model_schema_invalid"] };
    }
    const reasonCodes = [];
    if (normalized(input.decision.requestId) !== normalized(input.input.requestId) ||
        normalized(input.decision.workId) !== normalized(input.input.workId) ||
        normalized(input.decision.executionContractReceiptId) !==
            normalized(input.input.executionContractReceiptId))
        reasonCodes.push("execution_model_scope_mismatch");
    if (input.decision.selectedMode !== requiredMode(input.input.steps)) {
        reasonCodes.push("execution_mode_mismatch");
    }
    const stepIds = input.input.steps.map((step) => normalized(step.stepId));
    const receiptIds = input.input.executionReceipts.map((receipt) => normalized(receipt.receiptId));
    const receiptStepIds = input.input.executionReceipts.map((receipt) => normalized(receipt.stepId));
    if (!uniqueText(receiptIds) || !uniqueText(receiptStepIds)) {
        reasonCodes.push("execution_receipt_invalid");
    }
    if (input.input.executionReceipts.some((receipt) => normalized(receipt.workId) !== normalized(input.input.workId) ||
        !stepIds.includes(normalized(receipt.stepId))))
        reasonCodes.push("execution_receipt_scope_mismatch");
    const succeeded = input.input.executionReceipts
        .filter((receipt) => receipt.status === "succeeded")
        .map((receipt) => normalized(receipt.stepId))
        .sort();
    const expected = [...stepIds].sort();
    const complete = succeeded.length === expected.length &&
        succeeded.every((stepId, index) => stepId === expected[index]);
    if (input.input.completionRequested && !complete) {
        reasonCodes.push("analyzed_steps_not_executed");
    }
    if (!input.receipt || !normalized(input.receipt.receiptId)) {
        reasonCodes.push("execution_model_receipt_missing");
    }
    else if (input.receipt.schemaVersion !== 1 ||
        normalized(input.receipt.requestId) !== normalized(input.decision.requestId) ||
        normalized(input.receipt.workId) !== normalized(input.decision.workId) ||
        input.receipt.decisionFingerprint !== fingerprint(input.decision))
        reasonCodes.push("execution_model_receipt_mismatch");
    if (reasonCodes.length > 0 || !input.receipt) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    const base = {
        requestId: normalized(input.input.requestId),
        workId: normalized(input.input.workId),
        selectedMode: input.decision.selectedMode,
        receiptId: input.receipt.receiptId,
    };
    if (!complete) {
        return {
            status: "ready_to_execute",
            ...base,
            pendingStepIds: stepIds.filter((stepId) => !succeeded.includes(stepId)),
        };
    }
    return { status: "completed", ...base, executedStepIds: succeeded };
}
//# sourceMappingURL=execution-model-admission.js.map