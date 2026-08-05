export interface FinalStepReceipt {
    receiptId: string;
    workId: string;
    stepId: string;
    status: "succeeded" | "partial" | "failed";
}
export interface FinalCriterionDecision {
    criterionId: string;
    status: "satisfied" | "unsatisfied";
    evidenceRefs: string[];
}
export interface FinalResultReview {
    receiptId: string;
    workId: string;
    sufficiency: "sufficient" | "partial" | "insufficient";
    resultRef: string;
    requiredEvidenceRefs: string[];
}
export interface FinalDeliveryReceipt {
    receiptId: string;
    workId: string;
    resultRef: string;
    status: "delivered" | "failed";
}
export interface FinalSuccessAdmissionInput {
    workId: string;
    analyzedStepIds: string[];
    stepReceipts: FinalStepReceipt[];
    criteria: FinalCriterionDecision[];
    resultReview: FinalResultReview;
    finalPayload: {
        resultRef: string;
        evidenceRefs: string[];
    };
    deliveryReceipt?: FinalDeliveryReceipt;
}
export type FinalSuccessRejectionCode = "final_success_schema_invalid" | "final_success_scope_mismatch" | "analyzed_steps_incomplete" | "completion_criteria_unsatisfied" | "result_not_sufficient" | "required_evidence_missing" | "final_evidence_mismatch" | "final_result_mismatch" | "final_delivery_missing" | "final_delivery_failed";
export type FinalSuccessAdmission = {
    status: "success";
    workId: string;
    resultRef: string;
    evidenceRefs: string[];
    reviewReceiptId: string;
    deliveryReceiptId: string;
} | {
    status: "rejected";
    reasonCodes: FinalSuccessRejectionCode[];
};
export declare function admitFinalSuccess(input: FinalSuccessAdmissionInput): FinalSuccessAdmission;
//# sourceMappingURL=final-success-admission.d.ts.map