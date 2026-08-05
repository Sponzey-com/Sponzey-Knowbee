import type { VerifiedFailureReportFacts } from "../contracts/verified-failure-report.js";
import { type UserFacingNoticeRenderDependencies, type UserFacingNoticeRenderResolution } from "./user-facing-notice-rendering.js";
export type VerifiedFailureReportRenderResolution = {
    status: "ready";
    text: string;
    textSource: "llm_reviewed";
} | {
    status: "blocked";
    reason: string;
};
export type VerifiedFailureNoticeRenderer = (input: {
    originalRequest: string;
    rawText: string;
    textSource: "runtime_deterministic";
    contentKind: "final_report";
    reasonPrefix: string;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
}) => Promise<UserFacingNoticeRenderResolution>;
export declare function renderVerifiedFailureReport(input: {
    originalRequest: string;
    report: VerifiedFailureReportFacts;
    dependencies?: UserFacingNoticeRenderDependencies | undefined;
    renderNotice?: VerifiedFailureNoticeRenderer | undefined;
}): Promise<VerifiedFailureReportRenderResolution>;
//# sourceMappingURL=verified-failure-report-rendering.d.ts.map