import { authorizeDiagnosisActionRoute, } from "../contracts/diagnosis-action-routing.js";
import { authorizeUserFacingResponse, buildDirectLlmResponseReviewReceipt, buildLlmResponseReviewReceipt, } from "./user-facing-response-gate.js";
const TYPED_REDACTED_REFERENCE = /^[a-z][a-z0-9_-]*:[^\s]+$/;
const SENSITIVE_CONTENT = /(?:api[_-]?key|access[_-]?token|secret|password|token=|raw system prompt|raw tool output|memory:|begin (?:rsa |ec |openssh )?private key)/i;
function requireText(value, field) {
    const normalized = value.trim();
    if (!normalized)
        throw new Error(`${field} is required.`);
    if (normalized.length > 500)
        throw new Error(`${field} must not exceed 500 characters.`);
    if (SENSITIVE_CONTENT.test(normalized))
        throw new Error(`${field} contains sensitive content.`);
    return normalized;
}
function typedReferences(values, field) {
    const refs = values.map((value) => {
        const normalized = value.trim();
        if (SENSITIVE_CONTENT.test(normalized))
            throw new Error(`${field} contains sensitive content.`);
        if (!TYPED_REDACTED_REFERENCE.test(normalized))
            throw new Error(`${field} must be a typed redacted reference.`);
        return normalized;
    });
    return [...new Set(refs)];
}
function flowFromRoute(routeKind) {
    switch (routeKind) {
        case "direct_answer":
            return "direct_answer";
        case "planning":
            return "planning";
        case "delegation":
            return "delegation";
        case "tool":
            return "tool";
        case "yeonjang":
            return "yeonjang";
        case "prompt_improvement":
            return "prompt_improvement";
        case "partial_report":
        case "final_report":
        case "blocked":
            return "final_reporting";
        default:
            throw new Error(`Diagnosis route ${routeKind} is a continuation action, not one of the seven assistant flows.`);
    }
}
export function selectCanonicalAssistantFlow(input) {
    const route = authorizeDiagnosisActionRoute({
        receipt: input.receipt,
        subjectPayload: input.subjectPayload,
        diagnosis: input.diagnosis,
        requestedFlow: input.requestedFlow,
    });
    return {
        flow: flowFromRoute(route.routeKind),
        diagnosisReceiptId: route.receiptId,
        diagnosisTarget: route.target,
        recommendedAction: route.recommendedAction,
    };
}
export function assembleAssistantFinalLlmInput(input) {
    if (input.flow.recommendedAction !== input.diagnosis.recommended_action) {
        throw new Error("Assistant flow action does not match the final-input diagnosis action.");
    }
    return {
        schemaVersion: 1,
        flow: input.flow.flow,
        diagnosisReceiptId: requireText(input.flow.diagnosisReceiptId, "Diagnosis receipt ID"),
        diagnosisSummary: requireText(input.diagnosis.diagnosis_summary, "Diagnosis summary"),
        diagnosisReason: requireText(input.diagnosis.reason, "Diagnosis reason"),
        sourceRefs: typedReferences(input.sourceRefs, "Final source reference"),
        safetyOrAuditRefs: typedReferences(input.safetyOrAuditRefs, "Safety or audit reference"),
        expectedLanguage: input.expectedLanguage,
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
function serializeFinalInput(input) {
    return JSON.stringify({
        schemaVersion: input.schemaVersion,
        flow: input.flow,
        diagnosisReceiptId: input.diagnosisReceiptId,
        diagnosisSummary: input.diagnosisSummary,
        diagnosisReason: input.diagnosisReason,
        sourceRefs: input.sourceRefs,
        safetyOrAuditRefs: input.safetyOrAuditRefs,
        expectedLanguage: input.expectedLanguage,
        renderingRequired: input.renderingRequired,
        finalAnswer: input.finalAnswer,
        assistantIdentityClaim: input.assistantIdentityClaim,
    });
}
function contentKindFor(input) {
    if (input.safetyOrAuditRefs.length > 0)
        return "safety_notice";
    switch (input.flow) {
        case "direct_answer":
            return "direct_answer";
        case "planning":
            return "planning";
        case "delegation":
            return "delegation";
        case "tool":
            return "tool_result";
        case "yeonjang":
            return "yeonjang_result";
        case "prompt_improvement":
            return "prompt_improvement";
        case "final_reporting":
            return "final_report";
    }
}
export function buildAssistantFinalReviewReceipt(input) {
    if (contentKindFor(input.finalInput) === "direct_answer") {
        if (!input.directProvenance) {
            throw new Error("Direct answers require final LLM provider provenance.");
        }
        return buildDirectLlmResponseReviewReceipt({
            rawText: serializeFinalInput(input.finalInput),
            responseText: requireText(input.responseText, "Final response text"),
            ...input.directProvenance,
        });
    }
    return buildLlmResponseReviewReceipt({
        rawText: serializeFinalInput(input.finalInput),
        responseText: requireText(input.responseText, "Final response text"),
        rawTextSource: "runtime_deterministic",
        contentKind: contentKindFor(input.finalInput),
    });
}
export function authorizeAssistantFinalDelivery(input) {
    const rawTextSource = input.receipt?.schemaVersion === 2
        ? "llm_generated"
        : "runtime_deterministic";
    const authorization = authorizeUserFacingResponse({
        rawText: serializeFinalInput(input.finalInput),
        responseText: input.responseText,
        rawTextSource,
        contentKind: contentKindFor(input.finalInput),
        expectedLanguage: input.finalInput.expectedLanguage,
        receipt: input.receipt,
    });
    if (!authorization.ok || !input.receipt) {
        return {
            ok: false,
            reasonCode: authorization.reasonCode ?? "review_receipt_missing",
        };
    }
    return {
        ok: true,
        flow: input.finalInput.flow,
        reviewReceiptId: input.receipt.receiptId,
    };
}
//# sourceMappingURL=assistant-flow-finalization.js.map