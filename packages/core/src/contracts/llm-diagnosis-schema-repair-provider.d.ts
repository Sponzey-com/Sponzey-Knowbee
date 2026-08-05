import type { ContractValidationIssue } from "./index.js";
import { type BlockedLlmDiagnosisGateResult, type LlmDiagnosisGateResult, type LlmDiagnosisGateTarget, type ValidLlmDiagnosisGateResult } from "./llm-diagnosis-gate.js";
import type { DiagnosisSubjectKind } from "./diagnosis-action-routing.js";
export interface LlmDiagnosisSchemaRepairProviderInput {
    target: LlmDiagnosisGateTarget;
    invalidRawOutput: unknown;
    validationIssues: ContractValidationIssue[];
    ownerAgentName: string;
    workId?: string;
    stepId: string;
}
export interface LlmDiagnosisSchemaRepairProvider {
    repairDiagnosis(input: LlmDiagnosisSchemaRepairProviderInput): Promise<unknown> | unknown;
}
export interface RunDiagnosisSchemaRepairProviderInput extends LlmDiagnosisSchemaRepairProviderInput {
    provider: LlmDiagnosisSchemaRepairProvider;
    receiptBinding?: {
        receiptId: string;
        subjectKind: DiagnosisSubjectKind;
        subjectPayload: unknown;
    };
}
export interface ResolveLlmDiagnosisWithOneShotRepairInput {
    provider: LlmDiagnosisSchemaRepairProvider;
    target: LlmDiagnosisGateTarget;
    rawOutput: unknown;
    ownerAgentName: string;
    workId?: string;
    stepId: string;
    subject?: {
        receiptId: string;
        subjectKind: DiagnosisSubjectKind;
        subjectPayload: unknown;
    };
}
export type OneShotLlmDiagnosisResolution = (ValidLlmDiagnosisGateResult & {
    repairAttempted: boolean;
}) | (BlockedLlmDiagnosisGateResult & {
    repairAttempted: true;
});
export declare function runDiagnosisSchemaRepairProvider(input: RunDiagnosisSchemaRepairProviderInput): Promise<LlmDiagnosisGateResult>;
export declare function resolveLlmDiagnosisWithOneShotRepair(input: ResolveLlmDiagnosisWithOneShotRepairInput): Promise<OneShotLlmDiagnosisResolution>;
//# sourceMappingURL=llm-diagnosis-schema-repair-provider.d.ts.map