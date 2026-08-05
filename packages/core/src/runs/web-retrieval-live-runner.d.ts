import type { WebRetrievalLiveSmokeScenario, WebRetrievalLiveSmokeTrace } from "./web-retrieval-smoke.js";
import type { WebRetrievalCandidate } from "../contracts/web-retrieval.js";
import type { WebDocumentFetchFailureReason } from "./web-document-fetch-port.js";
import type { WebSearchFailureReason } from "./web-search-port.js";
export type WebRetrievalLiveRunnerErrorCode = "web_live_run_id_invalid" | "web_live_cancelled" | "web_live_search_evidence_invalid" | "web_live_search_audit_missing" | "web_live_llm_source_selection_invalid" | "web_live_fetch_evidence_invalid" | "web_live_fetch_audit_missing" | "web_live_llm_result_diagnosis_invalid" | "web_live_rediagnosis_invalid" | "web_live_rediagnosis_blocked" | "web_live_rediagnosis_exhausted" | "web_live_rediagnosis_strategy_duplicate";
export declare class WebRetrievalLiveRunnerError extends Error {
    readonly code: WebRetrievalLiveRunnerErrorCode;
    constructor(code: WebRetrievalLiveRunnerErrorCode);
}
export type WebRetrievalLiveFailureReasonCode = WebRetrievalLiveRunnerErrorCode | WebSearchFailureReason | WebDocumentFetchFailureReason;
export declare class WebRetrievalLivePortError extends Error {
    readonly reasonCode: WebRetrievalLiveFailureReasonCode;
    constructor(reasonCode: WebRetrievalLiveFailureReasonCode);
}
export type WebRetrievalLiveCandidate = WebRetrievalCandidate;
export interface WebRetrievalLiveSearchObservation {
    readonly candidates: readonly WebRetrievalLiveCandidate[];
    readonly auditEventId: string | null;
    readonly diagnosisPayload: unknown;
}
export interface WebRetrievalLiveFetchObservation {
    readonly evidenceRef: string;
    readonly sourceDomain: string;
    readonly sourceTimestamp: string | null;
    readonly fetchedAt: string;
    readonly auditEventId: string | null;
    readonly diagnosisPayload: unknown;
}
export interface WebRetrievalLiveExecutionInput {
    readonly runId: string;
    readonly scenario: WebRetrievalLiveSmokeScenario;
    readonly searchRequest: string;
    readonly signal: AbortSignal;
}
export interface WebRetrievalLiveFetchInput extends WebRetrievalLiveExecutionInput {
    readonly candidate: WebRetrievalLiveCandidate;
}
export interface WebRetrievalLivePlanInput extends WebRetrievalLiveExecutionInput {
    readonly candidates: readonly WebRetrievalLiveCandidate[];
    readonly diagnosisPayload: unknown;
}
export interface WebRetrievalLiveDiagnosisInput extends WebRetrievalLiveExecutionInput {
    readonly evidenceRef: string;
    readonly requestedTargetFingerprint: `sha256:${string}`;
    readonly diagnosisPayload: unknown;
}
export type WebRetrievalLiveSearchPort = (input: WebRetrievalLiveExecutionInput) => Promise<WebRetrievalLiveSearchObservation>;
export type WebRetrievalLiveFetchPort = (input: WebRetrievalLiveFetchInput) => Promise<WebRetrievalLiveFetchObservation>;
export type WebRetrievalLivePlanPort = (input: WebRetrievalLivePlanInput) => Promise<unknown>;
export type WebRetrievalLiveDiagnosisPort = (input: WebRetrievalLiveDiagnosisInput) => Promise<unknown>;
export type WebRetrievalFailureStage = "search" | "selection" | "fetch" | "verification";
export interface WebRetrievalLiveRediagnosisInput extends WebRetrievalLiveExecutionInput {
    readonly failure: Readonly<{
        stage: WebRetrievalFailureStage;
        reasonCode: WebRetrievalLiveFailureReasonCode;
    }>;
    readonly attemptFingerprints: readonly string[];
    readonly diagnosisPayload: unknown;
}
export type WebRetrievalLiveRediagnosisPort = (input: WebRetrievalLiveRediagnosisInput) => Promise<unknown>;
export declare function runWebRetrievalLiveScenario(input: {
    readonly runId: string;
    readonly scenario: WebRetrievalLiveSmokeScenario;
    readonly search: WebRetrievalLiveSearchPort;
    readonly plan: WebRetrievalLivePlanPort;
    readonly fetch: WebRetrievalLiveFetchPort;
    readonly diagnose: WebRetrievalLiveDiagnosisPort;
    readonly rediagnose?: WebRetrievalLiveRediagnosisPort | undefined;
    readonly maxAttempts?: number;
    readonly signal: AbortSignal;
}): Promise<WebRetrievalLiveSmokeTrace>;
//# sourceMappingURL=web-retrieval-live-runner.d.ts.map