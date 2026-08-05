import { type CanonicalResultLanguage, type CanonicalResultReportFacts } from "../contracts/canonical-result-report.js";
import type { NodeResultReport } from "../contracts/enterprise-topology.js";
import type { BlockedStopReportDecision } from "../contracts/stop-report-decision.js";
import type { CanonicalTerminalEvidenceResult } from "./canonical-terminal-evidence.js";
export declare function buildCanonicalCompletionExhaustedReport(input: {
    runId: string;
    primaryLanguage: CanonicalResultLanguage;
    evidenceRefs: readonly string[];
}): CanonicalResultReportFacts;
export declare function buildCanonicalCompletionBlockedReport(input: {
    runId: string;
    primaryLanguage: CanonicalResultLanguage;
    evidenceRefs: readonly string[];
}): CanonicalResultReportFacts;
export declare function buildCanonicalPartialTopologyReport(input: {
    runId: string;
    primaryLanguage: CanonicalResultLanguage;
    report: NodeResultReport;
}): CanonicalResultReportFacts;
export declare function buildCanonicalBlockedRuntimeReport(input: {
    primaryLanguage: CanonicalResultLanguage;
    terminalEvidence: Extract<CanonicalTerminalEvidenceResult, {
        status: "available";
    }>;
}): CanonicalResultReportFacts;
export declare function buildCanonicalTopologyTerminalReport(input: {
    runId: string;
    primaryLanguage: CanonicalResultLanguage;
    decision: Extract<BlockedStopReportDecision, {
        status: "stop_and_report";
    }>;
}): CanonicalResultReportFacts;
//# sourceMappingURL=canonical-runtime-result-report.d.ts.map