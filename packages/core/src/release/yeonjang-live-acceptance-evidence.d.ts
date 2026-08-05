import { type YeonjangLiveSmokeSummary } from "../runs/yeonjang-live-smoke.js";
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
export type YeonjangLiveEvidenceRejectionCode = "yeonjang_smoke_not_live" | "yeonjang_smoke_run_not_passed" | "yeonjang_smoke_scenario_duplicate" | "yeonjang_smoke_result_not_verified" | "yeonjang_smoke_read_only_method_required" | "yeonjang_smoke_trace_missing" | "yeonjang_smoke_instance_duplicate" | "yeonjang_smoke_instance_untrusted" | "yeonjang_smoke_instance_not_runnable" | "yeonjang_smoke_instance_not_connected" | "yeonjang_smoke_session_stale" | "yeonjang_smoke_target_mismatch" | "yeonjang_smoke_run_correlation_invalid" | "yeonjang_smoke_command_missing" | "yeonjang_smoke_command_mismatch" | "yeonjang_smoke_command_not_acked" | "yeonjang_smoke_observed_result_missing" | "yeonjang_smoke_observed_result_mismatch" | "yeonjang_smoke_llm_diagnosis_missing" | "yeonjang_smoke_llm_diagnosis_invalid" | "yeonjang_smoke_evidence_binding_invalid" | "yeonjang_smoke_audit_missing" | "yeonjang_smoke_unredacted";
export interface YeonjangLiveEvidenceRejection {
    scenarioId: string;
    reasonCode: YeonjangLiveEvidenceRejectionCode;
}
export interface YeonjangLiveEvidenceProductionResult {
    accepted: LiveAcceptanceEvidence[];
    rejected: YeonjangLiveEvidenceRejection[];
}
export declare function produceYeonjangLiveAcceptanceEvidence(input: {
    run: YeonjangLiveSmokeSummary;
    now: number;
    maxSessionAgeMs: number;
}): YeonjangLiveEvidenceProductionResult;
//# sourceMappingURL=yeonjang-live-acceptance-evidence.d.ts.map