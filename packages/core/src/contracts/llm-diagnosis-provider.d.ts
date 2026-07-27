import { type LlmDiagnosisGateResult } from "./llm-diagnosis-gate.js";
import { type LlmDiagnosisSchemaRepairProvider } from "./llm-diagnosis-schema-repair-provider.js";
import type { DiagnosisSubjectKind } from "./diagnosis-action-routing.js";
export type ResultDiagnosisSubjectKind = Exclude<DiagnosisSubjectKind, "user_request">;
export interface LlmRequestDiagnosisProviderInput {
    ownerAgentName: string;
    userRequestSummary: string;
    context: string[];
    constraints: string[];
    workId?: string;
    stepId: string;
}
export interface LlmResultDiagnosisProviderInput {
    ownerAgentName: string;
    resultSummary: string;
    expectedOutput: string;
    evidence: string[];
    risks: string[];
    workId?: string;
    stepId: string;
    evidenceSourceKind?: "tool" | "child" | "memory";
}
export interface LlmDiagnosisProvider {
    diagnoseRequest(input: LlmRequestDiagnosisProviderInput): Promise<unknown> | unknown;
    diagnoseResult(input: LlmResultDiagnosisProviderInput): Promise<unknown> | unknown;
}
export interface RunRequestDiagnosisProviderInput extends LlmRequestDiagnosisProviderInput {
    provider: LlmDiagnosisProvider;
    repairAttempted: boolean;
}
export interface RunResultDiagnosisProviderInput extends LlmResultDiagnosisProviderInput {
    provider: LlmDiagnosisProvider;
    repairAttempted: boolean;
    diagnosisSubjectKind?: ResultDiagnosisSubjectKind;
}
export interface RunRequestDiagnosisProviderWithRepairInput extends LlmRequestDiagnosisProviderInput {
    provider: LlmDiagnosisProvider;
    repairProvider: LlmDiagnosisSchemaRepairProvider;
}
export interface RunResultDiagnosisProviderWithRepairInput extends LlmResultDiagnosisProviderInput {
    provider: LlmDiagnosisProvider;
    repairProvider: LlmDiagnosisSchemaRepairProvider;
    diagnosisSubjectKind?: ResultDiagnosisSubjectKind;
}
export declare function runRequestDiagnosisProvider(input: RunRequestDiagnosisProviderInput): Promise<LlmDiagnosisGateResult>;
export declare function runRequestDiagnosisProviderWithRepair(input: RunRequestDiagnosisProviderWithRepairInput): Promise<LlmDiagnosisGateResult>;
export declare function runResultDiagnosisProvider(input: RunResultDiagnosisProviderInput): Promise<LlmDiagnosisGateResult>;
export declare function runResultDiagnosisProviderWithRepair(input: RunResultDiagnosisProviderWithRepairInput): Promise<LlmDiagnosisGateResult>;
//# sourceMappingURL=llm-diagnosis-provider.d.ts.map