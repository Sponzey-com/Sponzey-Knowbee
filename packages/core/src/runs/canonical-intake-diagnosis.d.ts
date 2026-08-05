export interface CanonicalIntakeDiagnosisDescriptor {
    runId: string;
    workId: string;
    receiptId: string;
    kind: "diagnosis";
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
interface CanonicalIntakeDiagnosisReceipt {
    receiptId: string;
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
export interface CanonicalIntakeDiagnosisRecorderDependencies {
    issueReceipt: (descriptor: Omit<CanonicalIntakeDiagnosisDescriptor, "runId">) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => CanonicalIntakeDiagnosisReceipt | undefined;
    applyDiagnosisTransition: (input: {
        runId: string;
        workId: string;
        receiptRef: string;
    }) => {
        status: string;
        reasonCode?: string | undefined;
    };
}
export type CanonicalIntakeDiagnosisRecordResult = {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export declare function recordCanonicalIntakeDiagnosis(descriptor: CanonicalIntakeDiagnosisDescriptor, dependencies: CanonicalIntakeDiagnosisRecorderDependencies): CanonicalIntakeDiagnosisRecordResult;
export declare function buildCanonicalIntakeDiagnosisDescriptor(input: {
    runId: string;
    intake: unknown;
}): CanonicalIntakeDiagnosisDescriptor;
export {};
//# sourceMappingURL=canonical-intake-diagnosis.d.ts.map