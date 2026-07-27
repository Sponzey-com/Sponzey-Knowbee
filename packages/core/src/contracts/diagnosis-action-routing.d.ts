import type { LlmRequestDiagnosisRecord, LlmResultDiagnosisRecord, RecommendedAction } from "./work-record.js";
export type DiagnosisSubjectKind = "user_request" | "tool_result" | "sub_agent_result" | "yeonjang_result" | "error" | "validation_result";
export type DiagnosisRequestedFlow = "standard" | "prompt_improvement";
export type DiagnosisRouteKind = "direct_answer" | "clarification" | "planning" | "delegation" | "tool" | "yeonjang" | "prompt_improvement" | "retry" | "redelegation" | "partial_report" | "final_report" | "blocked";
export interface LlmDiagnosisReceipt {
    schemaVersion: 1;
    receiptId: string;
    target: "request_diagnosis" | "result_diagnosis";
    subjectKind: DiagnosisSubjectKind;
    subjectFingerprint: string;
    diagnosisFingerprint: string;
    recommendedAction: RecommendedAction;
}
export interface DiagnosisActionRouteDecision {
    receiptId: string;
    target: LlmDiagnosisReceipt["target"];
    subjectKind: DiagnosisSubjectKind;
    recommendedAction: RecommendedAction;
    routeKind: DiagnosisRouteKind;
}
export type DiagnosisRoutingState = "received" | "diagnosis_pending" | "diagnosed" | "route_selected" | "executing" | "result_diagnosis_pending" | "result_diagnosed" | "next_action_selected" | "completed" | "awaiting_user" | "blocked";
export type DiagnosisRoutingEvent = "diagnosis_requested" | "request_diagnosed" | "route_selected" | "execution_started" | "execution_result_received" | "result_diagnosed" | "next_action_selected" | "execution_completed" | "clarification_selected" | "blocked_selected";
export declare function createLlmDiagnosisReceipt(input: {
    receiptId: string;
    target: LlmDiagnosisReceipt["target"];
    subjectKind: DiagnosisSubjectKind;
    subjectPayload: unknown;
    diagnosis: LlmRequestDiagnosisRecord | LlmResultDiagnosisRecord;
}): LlmDiagnosisReceipt;
export declare function authorizeDiagnosisActionRoute(input: {
    receipt: LlmDiagnosisReceipt | undefined;
    subjectPayload: unknown;
    diagnosis: LlmRequestDiagnosisRecord | LlmResultDiagnosisRecord;
    requestedFlow?: DiagnosisRequestedFlow;
}): DiagnosisActionRouteDecision;
export declare function transitionDiagnosisRouting(state: DiagnosisRoutingState, event: DiagnosisRoutingEvent): DiagnosisRoutingState;
//# sourceMappingURL=diagnosis-action-routing.d.ts.map