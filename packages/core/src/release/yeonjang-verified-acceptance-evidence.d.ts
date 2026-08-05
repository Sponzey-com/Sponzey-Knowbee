import type { YeonjangEvidenceEnvelope } from "../yeonjang/evidence.js";
import type { LiveAcceptanceEvidence } from "./live-acceptance-admission.js";
export type VerifiedYeonjangEvidenceRejectionCode = "verified_yeonjang_schema_invalid" | "verified_yeonjang_post_check_not_verified" | "verified_yeonjang_audit_missing" | "verified_yeonjang_redaction_invalid" | "verified_yeonjang_timestamp_invalid";
export interface VerifiedYeonjangAcceptanceEvidenceInput {
    readonly evidence: YeonjangEvidenceEnvelope;
    readonly auditEventId: string;
}
export interface VerifiedYeonjangEvidenceRejection {
    readonly toolName: string;
    readonly reasonCode: VerifiedYeonjangEvidenceRejectionCode;
}
export interface VerifiedYeonjangEvidenceProductionResult {
    readonly accepted: readonly LiveAcceptanceEvidence[];
    readonly rejected: readonly VerifiedYeonjangEvidenceRejection[];
}
export declare function produceVerifiedYeonjangAcceptanceEvidence(inputs: readonly VerifiedYeonjangAcceptanceEvidenceInput[]): VerifiedYeonjangEvidenceProductionResult;
//# sourceMappingURL=yeonjang-verified-acceptance-evidence.d.ts.map