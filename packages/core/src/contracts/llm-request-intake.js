import { createHash } from "node:crypto";
function normalized(value) {
    return value.trim();
}
function uniqueNonEmpty(values) {
    const normalizedValues = values.map(normalized);
    return (normalizedValues.every(Boolean) && new Set(normalizedValues).size === normalizedValues.length);
}
function sameOrderedValues(left, right) {
    return (left.length === right.length &&
        left.every((value, index) => normalized(value) === normalized(right[index] ?? "")));
}
function sameUnorderedValues(left, right) {
    if (!uniqueNonEmpty(left) || !uniqueNonEmpty(right))
        return false;
    const sortedLeft = left.map(normalized).sort();
    const sortedRight = right.map(normalized).sort();
    return sameOrderedValues(sortedLeft, sortedRight);
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
function decisionFingerprint(decision) {
    const hash = createHash("sha256")
        .update(`knowbee:llm-request-intake:${canonicalize(decision)}`)
        .digest("hex");
    return `sha256:${hash}`;
}
function validStringArray(value, allowEmpty) {
    return (Array.isArray(value) &&
        (allowEmpty || value.length > 0) &&
        value.every((item) => typeof item === "string") &&
        uniqueNonEmpty(value));
}
function structurallyValidDecision(decision) {
    return Boolean(decision?.schemaVersion === 1 &&
        normalized(decision.requestId) &&
        normalized(decision.originalRequest) &&
        normalized(decision.goal) &&
        normalized(decision.desiredResult) &&
        (decision.explicitExecutionMethod === null ||
            (typeof decision.explicitExecutionMethod === "string" &&
                normalized(decision.explicitExecutionMethod))) &&
        validStringArray(decision.completionCriteria, false) &&
        validStringArray(decision.forbiddenActions, true) &&
        validStringArray(decision.allowedTargets, true) &&
        (decision.deliveryDestination === null ||
            (typeof decision.deliveryDestination === "string" &&
                normalized(decision.deliveryDestination))) &&
        validStringArray(decision.approvalRequiredSideEffects, true) &&
        Array.isArray(decision.contextAssessments) &&
        decision.contextAssessments.every((assessment) => normalized(assessment.contextRef) &&
            typeof assessment.relevant === "boolean" &&
            normalized(assessment.reason)) &&
        validStringArray(decision.selectedContextRefs, true) &&
        Array.isArray(decision.instructionLineage) &&
        decision.instructionLineage.length > 0 &&
        decision.instructionLineage.every((item) => normalized(item.instructionId) &&
            Number.isSafeInteger(item.sequence) &&
            item.sequence >= 0) &&
        normalized(decision.latestInstructionId) &&
        normalized(decision.reason));
}
function structurallyValidContext(context) {
    const instructions = [...context.priorInstructions, context.latestInstruction];
    return Boolean(normalized(context.requestId) &&
        normalized(context.originalRequest) &&
        normalized(context.latestInstruction.instructionId) &&
        normalized(context.latestInstruction.text) === normalized(context.originalRequest) &&
        instructions.every((item) => normalized(item.instructionId) &&
            normalized(item.text) &&
            Number.isSafeInteger(item.sequence) &&
            item.sequence >= 0) &&
        uniqueNonEmpty(instructions.map((item) => item.instructionId)) &&
        instructions.every((item, index) => index === 0 || item.sequence > (instructions[index - 1]?.sequence ?? -1)) &&
        context.contextCandidates.every((candidate) => normalized(candidate.contextRef) &&
            normalized(candidate.content) &&
            (candidate.source === "conversation" || candidate.source === "memory")) &&
        uniqueNonEmpty(context.contextCandidates.map((candidate) => candidate.contextRef)));
}
function validContextSelection(context, decision) {
    const candidateRefs = context.contextCandidates.map((candidate) => candidate.contextRef);
    const assessmentRefs = decision.contextAssessments.map((assessment) => assessment.contextRef);
    if (!sameUnorderedValues(assessmentRefs, candidateRefs))
        return false;
    const relevantRefs = decision.contextAssessments
        .filter((assessment) => assessment.relevant)
        .map((assessment) => assessment.contextRef);
    return sameUnorderedValues(decision.selectedContextRefs, relevantRefs);
}
function validInstructionLineage(context, decision) {
    const expected = [...context.priorInstructions, context.latestInstruction];
    if (decision.instructionLineage.length !== expected.length)
        return false;
    return decision.instructionLineage.every((item, index) => {
        const expectedItem = expected[index];
        return (normalized(item.instructionId) === normalized(expectedItem?.instructionId ?? "") &&
            item.sequence === expectedItem?.sequence);
    });
}
export function createLlmRequestIntakeReceipt(input) {
    const receiptId = normalized(input.receiptId);
    if (!receiptId)
        throw new Error("Request intake receipt ID is required.");
    return {
        schemaVersion: 1,
        receiptId,
        requestId: normalized(input.decision.requestId),
        decisionFingerprint: decisionFingerprint(input.decision),
    };
}
export async function runLlmRequestIntakeProvider(input) {
    const decision = await input.provider.analyzeRequest(input.context);
    return {
        decision,
        receipt: createLlmRequestIntakeReceipt({ receiptId: input.receiptId, decision }),
    };
}
export function admitLlmRequestIntake(input) {
    if (!structurallyValidDecision(input.decision)) {
        return { status: "rejected", reasonCodes: ["intake_schema_invalid"] };
    }
    const reasonCodes = [];
    if (!structurallyValidContext(input.context))
        reasonCodes.push("request_context_invalid");
    if (normalized(input.decision.requestId) !== normalized(input.context.requestId)) {
        reasonCodes.push("request_scope_mismatch");
    }
    if (normalized(input.decision.originalRequest) !== normalized(input.context.originalRequest)) {
        reasonCodes.push("original_request_mismatch");
    }
    if (!validContextSelection(input.context, input.decision)) {
        reasonCodes.push("context_selection_invalid");
    }
    if (!validInstructionLineage(input.context, input.decision)) {
        reasonCodes.push("instruction_lineage_invalid");
    }
    if (normalized(input.decision.latestInstructionId) !==
        normalized(input.context.latestInstruction.instructionId)) {
        reasonCodes.push("latest_instruction_not_authoritative");
    }
    if (!input.receipt || !normalized(input.receipt.receiptId)) {
        reasonCodes.push("intake_receipt_missing");
    }
    else if (input.receipt.schemaVersion !== 1 ||
        normalized(input.receipt.requestId) !== normalized(input.decision.requestId) ||
        input.receipt.decisionFingerprint !== decisionFingerprint(input.decision)) {
        reasonCodes.push("intake_receipt_mismatch");
    }
    if (reasonCodes.length > 0 || !input.receipt) {
        return { status: "rejected", reasonCodes: [...new Set(reasonCodes)] };
    }
    return {
        status: "admitted",
        requestId: normalized(input.decision.requestId),
        originalRequest: input.decision.originalRequest,
        goal: input.decision.goal,
        desiredResult: input.decision.desiredResult,
        explicitExecutionMethod: input.decision.explicitExecutionMethod,
        latestInstructionId: input.decision.latestInstructionId,
        selectedContextRefs: [...input.decision.selectedContextRefs],
        constraints: {
            completionCriteria: [...input.decision.completionCriteria],
            forbiddenActions: [...input.decision.forbiddenActions],
            allowedTargets: [...input.decision.allowedTargets],
            deliveryDestination: input.decision.deliveryDestination,
            approvalRequiredSideEffects: [...input.decision.approvalRequiredSideEffects],
        },
        receiptId: input.receipt.receiptId,
    };
}
//# sourceMappingURL=llm-request-intake.js.map