import { type CanonicalResultReportFacts } from "../contracts/canonical-result-report.js";
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js";
export type TerminalReportDeliveryBindingReason = "terminal_report_invalid" | "terminal_report_work_mismatch" | "terminal_report_outcome_mismatch";
export type TerminalReportDeliveryBinding = {
    ok: true;
    facts: CanonicalResultReportFacts;
    reportFingerprint: `sha256:${string}`;
    reviewInput: string;
} | {
    ok: false;
    reasonCode: TerminalReportDeliveryBindingReason;
};
export interface TerminalReportResponseReview {
    ok: boolean;
    missingFields: string[];
    missingRequiredFragments: Array<{
        field: string;
        value: string;
    }>;
}
export declare function terminalReportRequired(finalOutcome: CanonicalFinalOutcome | undefined): boolean;
export declare function bindTerminalReportForDelivery(input: {
    runId: string;
    finalOutcome: CanonicalFinalOutcome;
    facts: CanonicalResultReportFacts;
    draftText: string;
}): TerminalReportDeliveryBinding;
export declare function reviewTerminalReportResponse(input: {
    facts: CanonicalResultReportFacts;
    responseText: string;
}): TerminalReportResponseReview;
//# sourceMappingURL=terminal-report-delivery-binding.d.ts.map