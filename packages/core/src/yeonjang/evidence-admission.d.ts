import type { ToolResult } from "../tools/types.js";
import type { YeonjangEvidenceEnvelope } from "./evidence.js";
export type YeonjangEvidenceAdmissionReasonCode = "YEONJANG_EVIDENCE_MISSING" | "YEONJANG_EVIDENCE_INVALID" | "YEONJANG_EVIDENCE_TOOL_MISMATCH" | "YEONJANG_POST_CHECK_UNVERIFIED" | "YEONJANG_GOAL_VALIDATION_RECEIPT_INVALID";
export type YeonjangEvidenceReviewAdmission = {
    status: "admitted";
    evidence: YeonjangEvidenceEnvelope;
} | {
    status: "blocked";
    reasonCode: YeonjangEvidenceAdmissionReasonCode;
    detail: string;
};
export interface AdmitYeonjangEvidenceForReviewInput {
    result: ToolResult;
    expectedToolName: string;
}
export declare function admitYeonjangEvidenceForReview(input: AdmitYeonjangEvidenceForReviewInput): YeonjangEvidenceReviewAdmission;
//# sourceMappingURL=evidence-admission.d.ts.map