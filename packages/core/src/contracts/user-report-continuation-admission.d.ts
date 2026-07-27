import type { RecursiveContinuationDecision } from "./recursive-resolution-governance.js";
export interface SuccessUserReport {
    status: "completed";
    actualResults: string[];
    evidenceSummaries: string[];
}
export interface BlockedAttemptedPath {
    pathId: string;
    strategyFingerprint: string;
    outcome: string;
}
export interface BlockedUserReport {
    status: "blocked";
    unfinishedItems: string[];
    directCause: {
        text: string;
        evidenceSummaries: string[];
    };
    attemptedPaths: BlockedAttemptedPath[];
    nextAction: {
        kind: "minimum_user_input" | "executable_next_method";
        text: string;
    };
}
export type UserResponseAction = {
    status: "continue_now";
    candidateId: string;
} | {
    status: "request_user_input";
} | {
    status: "report_blocked";
} | {
    status: "reassess";
};
export declare function buildSuccessUserReport(input: {
    actualResults: string[];
    evidenceSummaries: string[];
}): SuccessUserReport;
export declare function buildBlockedUserReport(input: {
    unfinishedItems: string[];
    directCause: {
        text: string;
        evidenceSummaries: string[];
    };
    attemptedPaths: BlockedAttemptedPath[];
    nextAction: BlockedUserReport["nextAction"];
}): BlockedUserReport;
export declare function decideUserResponseAction(input: {
    continuationDecision: RecursiveContinuationDecision;
    clarificationRequired: boolean;
    exhaustionAuthorized: boolean;
}): UserResponseAction;
//# sourceMappingURL=user-report-continuation-admission.d.ts.map