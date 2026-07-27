import { createHash } from "node:crypto";
const ROUTE_BY_ACTION = {
    direct_answer: "direct_answer",
    ask_clarification: "clarification",
    plan: "planning",
    delegate: "delegation",
    use_tool: "tool",
    use_yeonjang: "yeonjang",
    retry: "retry",
    redelegate: "redelegation",
    partial_report: "partial_report",
    final_report: "final_report",
    stop_blocked: "blocked",
};
const TRANSITIONS = {
    received: { diagnosis_requested: "diagnosis_pending" },
    diagnosis_pending: { request_diagnosed: "diagnosed", blocked_selected: "blocked" },
    diagnosed: {
        route_selected: "route_selected",
        clarification_selected: "awaiting_user",
        blocked_selected: "blocked",
    },
    route_selected: { execution_started: "executing" },
    executing: {
        execution_result_received: "result_diagnosis_pending",
        blocked_selected: "blocked",
    },
    result_diagnosis_pending: { result_diagnosed: "result_diagnosed", blocked_selected: "blocked" },
    result_diagnosed: {
        next_action_selected: "next_action_selected",
        clarification_selected: "awaiting_user",
        blocked_selected: "blocked",
    },
    next_action_selected: {
        execution_started: "executing",
        execution_completed: "completed",
        clarification_selected: "awaiting_user",
        blocked_selected: "blocked",
    },
};
function canonicalize(value) {
    if (value === null || typeof value !== "object")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(",")}]`;
    const entries = Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(",")}}`;
}
function fingerprint(namespace, value) {
    return createHash("sha256")
        .update(`knowbee:${namespace}:${canonicalize(value)}`)
        .digest("hex");
}
function requireText(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    return normalized;
}
export function createLlmDiagnosisReceipt(input) {
    return {
        schemaVersion: 1,
        receiptId: requireText(input.receiptId, "Diagnosis receipt ID"),
        target: input.target,
        subjectKind: input.subjectKind,
        subjectFingerprint: fingerprint(`diagnosis-subject:${input.target}:${input.subjectKind}`, input.subjectPayload),
        diagnosisFingerprint: fingerprint(`diagnosis-record:${input.target}`, input.diagnosis),
        recommendedAction: input.diagnosis.recommended_action,
    };
}
function isRequestDiagnosis(diagnosis) {
    return "intent" in diagnosis;
}
function assertDiagnosisActionConsistency(diagnosis) {
    const action = diagnosis.recommended_action;
    const nonCommittal = action === "ask_clarification" || action === "stop_blocked";
    if (isRequestDiagnosis(diagnosis)) {
        if (diagnosis.missing_information.length > 0 && !nonCommittal) {
            throw new Error("Diagnosis with missing information must select clarification or blocked reporting.");
        }
        return;
    }
    if (diagnosis.sufficiency !== "sufficient" && action === "final_report") {
        throw new Error(`${diagnosis.sufficiency} result cannot select final_report.`);
    }
    if (diagnosis.sufficiency === "sufficient" && (action === "retry" || action === "redelegate")) {
        throw new Error(`Sufficient result cannot select ${action}.`);
    }
    if (diagnosis.missing_information.length > 0 && action === "final_report") {
        throw new Error("Result with missing information cannot select final_report.");
    }
}
export function authorizeDiagnosisActionRoute(input) {
    if (!input.receipt)
        throw new Error("LLM diagnosis receipt is required before route selection.");
    const receipt = input.receipt;
    const expectedTarget = isRequestDiagnosis(input.diagnosis)
        ? "request_diagnosis"
        : "result_diagnosis";
    if (receipt.target !== expectedTarget)
        throw new Error("Diagnosis receipt target does not match diagnosis kind.");
    const subjectFingerprint = fingerprint(`diagnosis-subject:${receipt.target}:${receipt.subjectKind}`, input.subjectPayload);
    if (receipt.subjectFingerprint !== subjectFingerprint) {
        throw new Error("Diagnosis receipt subject fingerprint does not match the routed payload.");
    }
    const diagnosisFingerprint = fingerprint(`diagnosis-record:${receipt.target}`, input.diagnosis);
    if (receipt.diagnosisFingerprint !== diagnosisFingerprint) {
        throw new Error("Diagnosis receipt diagnosis fingerprint does not match the routed diagnosis.");
    }
    if (receipt.recommendedAction !== input.diagnosis.recommended_action) {
        throw new Error("Diagnosis receipt action does not match the routed diagnosis.");
    }
    assertDiagnosisActionConsistency(input.diagnosis);
    const requestedFlow = input.requestedFlow ?? "standard";
    if (requestedFlow === "prompt_improvement" && input.diagnosis.recommended_action !== "plan") {
        throw new Error("Prompt-improvement flow requires the canonical plan action.");
    }
    return {
        receiptId: receipt.receiptId,
        target: receipt.target,
        subjectKind: receipt.subjectKind,
        recommendedAction: receipt.recommendedAction,
        routeKind: requestedFlow === "prompt_improvement"
            ? "prompt_improvement"
            : ROUTE_BY_ACTION[receipt.recommendedAction],
    };
}
export function transitionDiagnosisRouting(state, event) {
    if (state === "completed" || state === "awaiting_user" || state === "blocked") {
        throw new Error(`Diagnosis routing state ${state} is terminal.`);
    }
    const next = TRANSITIONS[state]?.[event];
    if (!next)
        throw new Error(`Invalid diagnosis routing transition: ${state} + ${event}.`);
    return next;
}
//# sourceMappingURL=diagnosis-action-routing.js.map