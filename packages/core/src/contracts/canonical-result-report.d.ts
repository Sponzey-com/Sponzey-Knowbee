import type { StopReportInput } from "./stop-report-decision.js";
import type { VerifiedFailureReportFacts } from "./verified-failure-report.js";
export type CanonicalResultOutcome = "completed" | "partial" | "impossible" | "blocked";
export type CanonicalResultLanguage = "ko" | "en";
export type CanonicalNextActionKind = "user_action" | "required_condition";
export interface CanonicalNextAction {
    kind: CanonicalNextActionKind;
    text: string;
}
export interface CanonicalResultReportInput {
    goalId: string;
    workId: string;
    outcome: CanonicalResultOutcome;
    primaryLanguage: CanonicalResultLanguage;
    completedScope: string[];
    unresolvedScope: string[];
    reasonCode: string;
    verifiedReasonFacts: string[];
    evidenceRefs: string[];
    nextActions: CanonicalNextAction[];
}
export interface CanonicalResultReportFacts extends CanonicalResultReportInput {
    schemaVersion: 1;
}
export type CanonicalResultReportSource = {
    kind: "completion";
    report: StopReportInput;
    workId: string;
    primaryLanguage: CanonicalResultLanguage;
    completedScope: string[];
    verifiedReasonFacts: string[];
} | {
    kind: "verified_failure";
    report: VerifiedFailureReportFacts;
    goalId: string;
    workId: string;
    completedScope: string[];
};
export declare function buildCanonicalResultReportFacts(input: CanonicalResultReportInput): CanonicalResultReportFacts;
export declare function mapCanonicalResultReportFacts(source: CanonicalResultReportSource): CanonicalResultReportFacts;
//# sourceMappingURL=canonical-result-report.d.ts.map