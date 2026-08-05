import type { LlmInvocationReceiptRepository } from "../observability/llm-invocation-receipt-repository.js";
export interface LiveSmokeDecisionReceiptRefs {
    directResponseReceiptId?: string;
    directResponseReceiptValid?: boolean;
    requestDiagnosisReceiptId?: string;
    solutionPlanReceiptId?: string;
    resultReviewReceiptId?: string;
    finalResponseReceiptId?: string;
    decisionReceiptOrderValid: boolean;
    capabilityAdmissionReceiptId?: string;
}
export interface CapabilityAdmissionEvidenceReader {
    readForRun(runId: string): string | undefined;
}
export type LiveSmokeDecisionReceiptReader = (runId: string, requestGroupId: string) => LiveSmokeDecisionReceiptRefs;
export declare function createLiveSmokeDecisionReceiptReader(repository: Pick<LlmInvocationReceiptRepository, "list">, capabilityAdmissionReader?: CapabilityAdmissionEvidenceReader): LiveSmokeDecisionReceiptReader;
//# sourceMappingURL=live-smoke-decision-receipts.d.ts.map