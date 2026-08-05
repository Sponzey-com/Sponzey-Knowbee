import { type ExtensionLiveCapability, type ExtensionLiveSmokeScenario, type ExtensionLiveSmokeSummary, type ExtensionLiveToolExecutionReceipt } from "./extension-live-smoke.js";
export type ExtensionLiveSmokeRunnerErrorCode = "extension_smoke_run_id_invalid" | "extension_smoke_scenario_set_invalid" | "extension_smoke_read_only_required" | "extension_smoke_cancelled";
export type ExtensionLiveSmokeRejectionCode = "extension_smoke_execution_failed" | "extension_smoke_tool_receipt_invalid" | "extension_smoke_audit_missing" | "extension_smoke_llm_diagnosis_invalid";
export declare class ExtensionLiveSmokeRunnerError extends Error {
    readonly code: ExtensionLiveSmokeRunnerErrorCode;
    constructor(code: ExtensionLiveSmokeRunnerErrorCode);
}
export interface ExtensionLiveAuthorizationReceipt {
    readonly snapshotCapturedAt: number;
    readonly capability: ExtensionLiveCapability;
    readonly agentId: string;
    readonly bindingId: string;
    readonly catalogId: string;
    readonly toolName: string;
    readonly secretScopeId?: string;
}
export interface ExtensionLiveSmokeSelection {
    readonly scenario: ExtensionLiveSmokeScenario;
    readonly params: Readonly<Record<string, unknown>>;
    readonly authorization: ExtensionLiveAuthorizationReceipt;
}
export interface ExtensionLiveObservedExecution {
    readonly toolExecution: ExtensionLiveToolExecutionReceipt;
    readonly auditEventId: string | null;
    readonly diagnosisPayload: unknown;
}
export interface ExtensionLiveSmokeExecutionInput {
    readonly runId: string;
    readonly selection: ExtensionLiveSmokeSelection;
    readonly signal: AbortSignal;
}
export interface ExtensionLiveSmokeDiagnosisInput {
    readonly runId: string;
    readonly scenario: ExtensionLiveSmokeScenario;
    readonly evidenceRef: string;
    readonly diagnosisPayload: unknown;
    readonly signal: AbortSignal;
}
export type ExtensionLiveSmokeExecutePort = (input: ExtensionLiveSmokeExecutionInput) => Promise<ExtensionLiveObservedExecution>;
export type ExtensionLiveSmokeDiagnosisPort = (input: ExtensionLiveSmokeDiagnosisInput) => Promise<unknown>;
export declare function runExtensionLiveSmokeScenarios(input: {
    readonly runId: string;
    readonly selections: readonly ExtensionLiveSmokeSelection[];
    readonly execute: ExtensionLiveSmokeExecutePort;
    readonly diagnose: ExtensionLiveSmokeDiagnosisPort;
    readonly now: () => number;
    readonly signal: AbortSignal;
}): Promise<ExtensionLiveSmokeSummary>;
//# sourceMappingURL=extension-live-smoke-runner.d.ts.map