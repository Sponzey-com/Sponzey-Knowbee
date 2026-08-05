type Sha256Fingerprint = `sha256:${string}`;
export interface CanonicalAnalysisRevisionDescriptor {
    runId: string;
    workId: string;
    receiptId: string;
    kind: "analysis_revision";
    evidenceFingerprint: Sha256Fingerprint;
    evidenceRefs: string[];
    previousAnalysisFingerprint: Sha256Fingerprint;
    revisedAnalysisFingerprint: Sha256Fingerprint;
}
interface PersistedAnalysisRevisionReceipt {
    receiptId: string;
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
interface CanonicalAnalysisRevisionRecorderDependencies {
    issueReceipt: (receipt: Pick<CanonicalAnalysisRevisionDescriptor, "receiptId" | "workId" | "kind" | "evidenceFingerprint" | "evidenceRefs">) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedAnalysisRevisionReceipt | undefined;
    applyRevisionTransition: (input: {
        runId: string;
        workId: string;
        expectedRevision: number;
        receiptRef: string;
    }) => {
        status: string;
        reasonCode?: string | undefined;
    };
}
export declare function buildCanonicalAnalysisRevisionDescriptor(input: {
    runId: string;
    previousAnalysisFingerprint: Sha256Fingerprint;
    revisedAnalysisFingerprint: Sha256Fingerprint;
    safeEvidenceRefs?: readonly string[];
}): {
    ok: true;
    descriptor: CanonicalAnalysisRevisionDescriptor;
} | {
    ok: false;
    reasonCode: "analysis_revision_run_id_required" | "analysis_revision_fingerprint_invalid" | "analysis_revision_unchanged";
};
export declare function recordCanonicalAnalysisRevision(descriptor: CanonicalAnalysisRevisionDescriptor, expectedRevision: number, dependencies: CanonicalAnalysisRevisionRecorderDependencies): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=canonical-analysis-revision.d.ts.map