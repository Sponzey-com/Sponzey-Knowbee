import { type LlmDiagnosisReceipt } from "./diagnosis-action-routing.js";
import type { LlmResultDiagnosisRecord } from "./work-record.js";
export type ResultReviewSourceKind = "sub_agent_result" | "tool_result" | "yeonjang_result";
export type ResultReviewRisk = "low" | "medium" | "high" | "critical" | "unknown";
export type ReviewedResultStatus = "completed" | "partial" | "failed" | "blocked";
export type ParentResultAction = "accept" | "aggregate" | "redelegate" | "verify_more" | "report_partial" | "terminate";
export interface NormalizedResultReviewSubject {
    schemaVersion: 1;
    sourceKind: ResultReviewSourceKind;
    sourceRef: string;
    sourceAgentName?: string;
    status: ReviewedResultStatus;
    risk: ResultReviewRisk;
    evidenceRefs: string[];
    missingItems: string[];
    conflicts: string[];
    risks: string[];
    failureReasons: string[];
}
export interface MandatoryResultReviewDecision {
    reviewRequired: boolean;
    reasonCodes: string[];
}
export interface ParentResultActionDecision {
    action: ParentResultAction;
    diagnosisReceiptId: string;
    sourceKind: ResultReviewSourceKind;
    sourceRef: string;
    reasonCodes: string[];
}
export interface EvidenceBackedClaim {
    text: string;
    sourceRef: string;
    evidenceRefs: string[];
}
export interface DiagnosedResultForAggregation {
    subject: NormalizedResultReviewSubject;
    diagnosis: LlmResultDiagnosisRecord;
    receipt: LlmDiagnosisReceipt;
    parentDecision: ParentResultActionDecision;
    confirmedClaims: EvidenceBackedClaim[];
}
export interface EvidencePreservingResultAggregate {
    schemaVersion: 1;
    claims: EvidenceBackedClaim[];
    sourceRefs: string[];
    evidenceRefs: string[];
    conflicts: Array<{
        text: string;
        sourceRef: string;
    }>;
    uncertainties: Array<{
        text: string;
        sourceRef: string;
    }>;
    missingItems: Array<{
        text: string;
        sourceRef: string;
    }>;
    risks: Array<{
        text: string;
        sourceRef: string;
    }>;
    failureReasons: Array<{
        text: string;
        sourceRef: string;
    }>;
    finalizationEligible: boolean;
    nextAction: ParentResultAction;
    reasonCodes: string[];
}
export declare function normalizeResultReviewSubject(input: Omit<NormalizedResultReviewSubject, "schemaVersion">): NormalizedResultReviewSubject;
export declare function decideMandatoryResultReview(input: {
    subject: NormalizedResultReviewSubject;
    reviewConfigured: boolean;
}): MandatoryResultReviewDecision;
export declare function decideParentResultAction(input: {
    subject: NormalizedResultReviewSubject;
    diagnosis: LlmResultDiagnosisRecord;
    receipt: LlmDiagnosisReceipt | undefined;
    aggregateRequested?: boolean;
}): ParentResultActionDecision;
export declare function aggregateDiagnosedResults(inputs: DiagnosedResultForAggregation[]): EvidencePreservingResultAggregate;
//# sourceMappingURL=result-review-decision.d.ts.map