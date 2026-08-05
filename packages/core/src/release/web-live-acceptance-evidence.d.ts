import type { WebRetrievalLiveSmokeSummary } from "../runs/web-retrieval-smoke.js";
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
export type WebLiveEvidenceRejectionCode = "web_smoke_not_live" | "web_smoke_run_not_passed" | "web_smoke_scenario_duplicate" | "web_smoke_result_not_passed" | "web_smoke_answer_missing" | "web_smoke_llm_diagnosis_missing" | "web_smoke_llm_diagnosis_invalid" | "web_smoke_source_provenance_missing" | "web_smoke_source_timestamp_invalid" | "web_smoke_source_stale" | "web_smoke_target_binding_invalid" | "web_smoke_audit_missing" | "web_smoke_unredacted";
export interface WebLiveEvidenceRejection {
    scenarioId: string;
    reasonCode: WebLiveEvidenceRejectionCode;
}
export interface WebLiveEvidenceProductionResult {
    accepted: LiveAcceptanceEvidence[];
    rejected: WebLiveEvidenceRejection[];
}
export interface WebLiveEvidenceProductionInput {
    run: WebRetrievalLiveSmokeSummary;
    now: number;
    maxSourceAgeMs: number;
}
export declare function produceWebLiveAcceptanceEvidence(input: WebLiveEvidenceProductionInput): WebLiveEvidenceProductionResult;
//# sourceMappingURL=web-live-acceptance-evidence.d.ts.map