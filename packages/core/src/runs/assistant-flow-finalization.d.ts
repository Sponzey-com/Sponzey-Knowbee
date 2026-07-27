import { type DiagnosisRequestedFlow, type LlmDiagnosisReceipt } from "../contracts/diagnosis-action-routing.js";
import type { LlmRequestDiagnosisRecord, LlmResultDiagnosisRecord, RecommendedAction } from "../contracts/work-record.js";
import { type LlmResponseReviewReceipt, type UserFacingResponseAuthorization } from "./user-facing-response-gate.js";
export type AssistantFlowKind = "direct_answer" | "planning" | "delegation" | "tool" | "yeonjang" | "prompt_improvement" | "final_reporting";
export interface CanonicalAssistantFlowDecision {
    flow: AssistantFlowKind;
    diagnosisReceiptId: string;
    diagnosisTarget: LlmDiagnosisReceipt["target"];
    recommendedAction: RecommendedAction;
}
export interface AssistantFinalLlmInput {
    schemaVersion: 1;
    flow: AssistantFlowKind;
    diagnosisReceiptId: string;
    diagnosisSummary: string;
    diagnosisReason: string;
    sourceRefs: string[];
    safetyOrAuditRefs: string[];
    expectedLanguage: "ko" | "en" | "unknown";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function selectCanonicalAssistantFlow(input: {
    subjectPayload: unknown;
    diagnosis: LlmRequestDiagnosisRecord | LlmResultDiagnosisRecord;
    receipt: LlmDiagnosisReceipt | undefined;
    requestedFlow: DiagnosisRequestedFlow;
}): CanonicalAssistantFlowDecision;
export declare function assembleAssistantFinalLlmInput(input: {
    flow: CanonicalAssistantFlowDecision;
    diagnosis: LlmRequestDiagnosisRecord | LlmResultDiagnosisRecord;
    sourceRefs: string[];
    safetyOrAuditRefs: string[];
    expectedLanguage: AssistantFinalLlmInput["expectedLanguage"];
}): AssistantFinalLlmInput;
export declare function buildAssistantFinalReviewReceipt(input: {
    finalInput: AssistantFinalLlmInput;
    responseText: string;
}): LlmResponseReviewReceipt;
export type AssistantFinalDeliveryAuthorization = {
    ok: true;
    flow: AssistantFlowKind;
    reviewReceiptId: string;
} | {
    ok: false;
    reasonCode: NonNullable<UserFacingResponseAuthorization["reasonCode"]>;
};
export declare function authorizeAssistantFinalDelivery(input: {
    finalInput: AssistantFinalLlmInput;
    responseText: string;
    receipt?: LlmResponseReviewReceipt | undefined;
}): AssistantFinalDeliveryAuthorization;
//# sourceMappingURL=assistant-flow-finalization.d.ts.map