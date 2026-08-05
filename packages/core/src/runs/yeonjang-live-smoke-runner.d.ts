import { type YeonjangLiveCommandReceipt, type YeonjangLiveInstanceReceipt, type YeonjangLiveObservedResultReceipt, type YeonjangLiveSmokeScenario, type YeonjangLiveSmokeSummary } from "./yeonjang-live-smoke.js";
export type YeonjangLiveSmokeRunnerErrorCode = "yeonjang_smoke_run_id_invalid" | "yeonjang_smoke_max_age_invalid" | "yeonjang_smoke_cancelled";
export type YeonjangLiveSmokeRunnerRejectionCode = "yeonjang_smoke_scenario_invalid" | "yeonjang_smoke_instance_not_connected" | "yeonjang_smoke_instance_duplicate" | "yeonjang_smoke_instance_untrusted" | "yeonjang_smoke_instance_not_runnable" | "yeonjang_smoke_target_mismatch" | "yeonjang_smoke_session_stale" | "yeonjang_smoke_execution_failed" | "yeonjang_smoke_command_mismatch" | "yeonjang_smoke_command_not_acked" | "yeonjang_smoke_observed_result_missing" | "yeonjang_smoke_observed_result_mismatch" | "yeonjang_smoke_audit_missing" | "yeonjang_smoke_llm_diagnosis_invalid";
export declare class YeonjangLiveSmokeRunnerError extends Error {
    readonly code: YeonjangLiveSmokeRunnerErrorCode;
    constructor(code: YeonjangLiveSmokeRunnerErrorCode);
}
export interface YeonjangLiveSmokeSelection {
    readonly scenario: YeonjangLiveSmokeScenario;
    readonly instance: YeonjangLiveInstanceReceipt;
}
export interface YeonjangLiveObservedExecution {
    readonly command: YeonjangLiveCommandReceipt | null;
    readonly observedResult: YeonjangLiveObservedResultReceipt | null;
    readonly auditEventId: string | null;
    readonly diagnosisPayload: unknown;
}
export interface YeonjangLiveSmokeExecutionInput {
    readonly runId: string;
    readonly selection: YeonjangLiveSmokeSelection;
    readonly signal: AbortSignal;
}
export interface YeonjangLiveSmokeDiagnosisInput {
    readonly runId: string;
    readonly scenario: YeonjangLiveSmokeScenario;
    readonly evidenceRef: string;
    readonly diagnosisPayload: unknown;
    readonly signal: AbortSignal;
}
export type YeonjangLiveSmokeExecutePort = (input: YeonjangLiveSmokeExecutionInput) => Promise<YeonjangLiveObservedExecution>;
export type YeonjangLiveSmokeDiagnosisPort = (input: YeonjangLiveSmokeDiagnosisInput) => Promise<unknown>;
export declare function runYeonjangLiveSmokeScenario(input: {
    readonly runId: string;
    readonly selection: YeonjangLiveSmokeSelection;
    readonly execute: YeonjangLiveSmokeExecutePort;
    readonly diagnose: YeonjangLiveSmokeDiagnosisPort;
    readonly maxInstanceAgeMs: number;
    readonly now: () => number;
    readonly signal: AbortSignal;
}): Promise<YeonjangLiveSmokeSummary>;
export declare function runYeonjangLiveSmokeScenarios(input: {
    readonly runId: string;
    readonly selections: readonly YeonjangLiveSmokeSelection[];
    readonly execute: YeonjangLiveSmokeExecutePort;
    readonly diagnose: YeonjangLiveSmokeDiagnosisPort;
    readonly maxInstanceAgeMs: number;
    readonly now: () => number;
    readonly signal: AbortSignal;
}): Promise<YeonjangLiveSmokeSummary>;
//# sourceMappingURL=yeonjang-live-smoke-runner.d.ts.map