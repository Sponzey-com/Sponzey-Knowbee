import { createHash } from "node:crypto";
function requiredText(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
function timestamp(value, field) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${field} must be a non-negative safe integer.`);
    }
    return value;
}
function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    const entries = Object.entries(value)
        .filter(([, nested]) => nested !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(",")}}`;
}
function validatePlan(plan) {
    const ownerAgentName = requiredText(plan.ownerAgentName, "Plan owner agent name");
    if (plan.steps.length === 0)
        throw new Error("Solution plan requires at least one step.");
    const stepIds = plan.steps.map((step) => requiredText(step.step_id, "Plan step ID"));
    if (new Set(stepIds).size !== stepIds.length)
        throw new Error("Solution plan step IDs must be unique.");
    for (const step of plan.steps) {
        requiredText(step.owner_agent_name, "Plan step owner");
        requiredText(step.expected_output, "Plan step expected output");
        requiredText(step.completion_criteria, "Plan step completion criteria");
    }
    return { ownerAgentName, steps: plan.steps };
}
function planFingerprint(plan) {
    const digest = createHash("sha256")
        .update(`knowbee:llm-solution-plan:${canonicalize(validatePlan(plan))}`)
        .digest("hex");
    return `sha256:${digest}`;
}
export function createLlmSolutionPlanReceipt(input) {
    const requestDiagnosisIssuedAt = timestamp(input.requestDiagnosisIssuedAt, "Request diagnosis issued time");
    const issuedAt = timestamp(input.issuedAt, "Solution plan issued time");
    if (issuedAt <= requestDiagnosisIssuedAt) {
        throw new Error("Solution plan must be issued after request diagnosis.");
    }
    return {
        schemaVersion: 1,
        receiptId: requiredText(input.receiptId, "Solution plan receipt ID"),
        workId: requiredText(input.workId, "Solution plan work ID"),
        runId: requiredText(input.runId, "Solution plan run ID"),
        requestDiagnosisReceiptId: requiredText(input.requestDiagnosisReceiptId, "Request diagnosis receipt ID"),
        planFingerprint: planFingerprint(input.plan),
        issuedAt,
    };
}
export function validateLlmSolutionPlanReceipt(input) {
    const receipt = input.receipt;
    if (!receipt)
        return { ok: false, reasonCode: "solution_plan_receipt_missing" };
    if (receipt.schemaVersion !== 1 ||
        !receipt.receiptId.trim() ||
        !/^sha256:[a-f0-9]{64}$/u.test(receipt.planFingerprint) ||
        !Number.isSafeInteger(receipt.issuedAt) ||
        receipt.issuedAt < 0) {
        return { ok: false, reasonCode: "solution_plan_receipt_invalid" };
    }
    if (receipt.workId !== input.workId || receipt.runId !== input.runId) {
        return { ok: false, reasonCode: "solution_plan_scope_mismatch" };
    }
    if (receipt.requestDiagnosisReceiptId !== input.requestDiagnosisReceiptId) {
        return { ok: false, reasonCode: "solution_plan_diagnosis_mismatch" };
    }
    if (receipt.issuedAt <= input.requestDiagnosisIssuedAt) {
        return { ok: false, reasonCode: "solution_plan_order_invalid" };
    }
    if (receipt.planFingerprint !== planFingerprint(input.plan)) {
        return { ok: false, reasonCode: "solution_plan_fingerprint_mismatch" };
    }
    return { ok: true };
}
//# sourceMappingURL=llm-solution-plan-receipt.js.map