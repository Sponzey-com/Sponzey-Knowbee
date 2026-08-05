export type WorktreeChangeKind = "added" | "copied" | "deleted" | "modified" | "renamed" | "untracked" | "conflicted";
export type WorktreeArtifactCategory = "source" | "generated" | "test" | "prompt" | "migration" | "docs" | "task_only";
export interface WorktreeChangeInput {
    status: string;
    path: string;
    originalPath?: string;
}
export interface ClassifiedWorktreeChange {
    status: string;
    path: string;
    originalPath?: string;
    changeKind: WorktreeChangeKind;
    category: WorktreeArtifactCategory;
    ownerArtifactId: string;
    reasonCode: string;
}
export type WorktreeBaselineDiagnosticCode = "unsafe_path" | "status_unrecognized" | "artifact_unclassified";
export interface WorktreeBaselineDiagnostic {
    path: string;
    code: WorktreeBaselineDiagnosticCode;
}
export interface WorktreeClassificationResult {
    complete: boolean;
    records: ClassifiedWorktreeChange[];
    diagnostics: WorktreeBaselineDiagnostic[];
}
export interface WorktreeBaselineReceipt {
    schemaVersion: 1;
    repositoryRoot: string;
    headSha: string;
    headCommittedAt: string;
    capturedAt: string;
    complete: boolean;
    counts: {
        total: number;
        tracked: number;
        untracked: number;
        deleted: number;
        unknown: number;
        byCategory: Partial<Record<WorktreeArtifactCategory, number>>;
    };
    records: ClassifiedWorktreeChange[];
    diagnostics: WorktreeBaselineDiagnostic[];
}
export declare function classifyWorktreeChanges(changes: readonly WorktreeChangeInput[]): WorktreeClassificationResult;
export declare function buildWorktreeBaselineReceipt(input: {
    repositoryRoot: string;
    headSha: string;
    headCommittedAt: string;
    capturedAt: string;
    changes: readonly WorktreeChangeInput[];
}): WorktreeBaselineReceipt;
//# sourceMappingURL=worktree-baseline.d.ts.map