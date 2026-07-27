export interface ResolutionAttemptRecord {
    attemptId: string;
    workId: string;
    stepId: string;
    meansId: string;
    inputRefs: string[];
    targetId: string;
    strategyFingerprint: string;
    resultRefs: string[];
    failureCause?: string;
    validation: {
        status: "sufficient" | "insufficient" | "failed";
        evidenceRefs: string[];
        reason: string;
    };
}
export interface ProposedResolutionAttempt {
    attemptId: string;
    meansId: string;
    inputRefs: string[];
    targetId: string;
    strategyFingerprint: string;
}
export type ResolutionChangedDimension = "means" | "input" | "target" | "strategy";
export type NextResolutionAttemptAdmission = {
    status: "allowed";
    workId: string;
    attemptId: string;
    changedDimensions: ResolutionChangedDimension[];
} | {
    status: "rejected";
    reasonCodes: Array<"resolution_input_invalid" | "attempt_record_invalid" | "attempt_id_duplicate" | "unchanged_attempt">;
};
export type IncompleteWebRecoveryPath = "source_fetch" | "alternate_source" | "dedicated_api" | "skill_or_mcp" | "other_means";
export interface IncompleteWebPathReview {
    path: IncompleteWebRecoveryPath;
    status: "unreviewed" | "available" | "unavailable";
    evidenceRefs: string[];
}
export type IncompleteWebRecoveryAdmission = {
    status: "selected";
    workId: string;
    path: IncompleteWebRecoveryPath;
    evidenceRefs: string[];
} | {
    status: "continue";
    workId: string;
    availablePaths: IncompleteWebRecoveryPath[];
    unreviewedPaths: IncompleteWebRecoveryPath[];
} | {
    status: "exhausted";
    workId: string;
    reviewedPaths: IncompleteWebRecoveryPath[];
} | {
    status: "rejected";
    reasonCodes: Array<"web_recovery_input_invalid" | "failed_search_attempt_invalid" | "path_reviews_invalid" | "selected_path_unavailable">;
};
export declare function isValidResolutionAttemptRecord(record: ResolutionAttemptRecord): boolean;
export declare function admitNextResolutionAttempt(input: {
    workId: string;
    unresolvedGoal: string;
    priorAttempts: ResolutionAttemptRecord[];
    nextAttempt: ProposedResolutionAttempt;
}): NextResolutionAttemptAdmission;
export declare function admitIncompleteWebRecovery(input: {
    workId: string;
    failedSearchAttempt: ResolutionAttemptRecord;
    pathReviews: IncompleteWebPathReview[];
    selectedPath?: IncompleteWebRecoveryPath;
}): IncompleteWebRecoveryAdmission;
//# sourceMappingURL=recursive-resolution-admission.d.ts.map