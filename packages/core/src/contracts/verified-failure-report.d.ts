import type { StructuredFailureRecoveryDecision } from "./failure-recovery-decision.js";
import type { AuthorizedSolutionPathExhaustionAssessment } from "./solution-path-exhaustion.js";
export type VerifiedFailureReportOutcome = "blocked" | "partial";
export type VerifiedFailureReportLanguage = "ko" | "en";
export interface VerifiedFailureReason {
    reasonCode: string;
    text: string;
    evidenceRefs: string[];
}
export interface VerifiedFailureReportFacts {
    schemaVersion: 1;
    outcome: VerifiedFailureReportOutcome;
    primaryLanguage: VerifiedFailureReportLanguage;
    failedScope: string[];
    verifiedReason: VerifiedFailureReason;
    nextActions: string[];
    partialResultRefs: string[];
    diagnosisReceiptId: string;
}
export declare function buildVerifiedFailureReportFacts(input: {
    decision: StructuredFailureRecoveryDecision;
    exhaustion: AuthorizedSolutionPathExhaustionAssessment;
    primaryLanguage: VerifiedFailureReportLanguage;
}): VerifiedFailureReportFacts;
//# sourceMappingURL=verified-failure-report.d.ts.map