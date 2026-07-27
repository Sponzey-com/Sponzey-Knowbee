export type ConversationBaselineClassification = "product_defect" | "missing_coverage" | "stale_test" | "live_prerequisite";
export interface ConversationBaselineTestFile {
    path: string;
    status: "passed" | "failed";
    testCount: number;
    firstFailure?: string;
    classification?: ConversationBaselineClassification;
}
export interface ConversationProcessBaselineInput {
    command: string;
    buildRevision: string;
    capturedAt: string;
    testFiles: readonly ConversationBaselineTestFile[];
}
export interface ConversationProcessBaselineEvidence {
    schemaVersion: 1;
    evidenceClass: "working_evidence_only";
    command: string;
    buildRevision: string;
    capturedAt: string;
    totals: {
        files: number;
        tests: number;
        passedFiles: number;
        failedFiles: number;
    };
    files: readonly ConversationBaselineTestFile[];
}
export type ConversationProcessBaselineProjection = {
    status: "ready";
    evidence: ConversationProcessBaselineEvidence;
} | {
    status: "rejected";
    reasonCode: "invalid_command" | "invalid_build_revision" | "invalid_capture_time" | "invalid_test_file" | "unsafe_evidence_text";
};
export declare function projectConversationProcessBaseline(input: ConversationProcessBaselineInput): ConversationProcessBaselineProjection;
//# sourceMappingURL=conversation-process-baseline.d.ts.map