import type { ExecutionAttemptPassResult } from "./execution-attempt-pass.js";
export interface CanonicalAttemptEvidenceDescriptor {
    runId: string;
    workId: string;
    receiptId: string;
    kind: "attempt";
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
export declare function buildCanonicalAttemptEvidenceDescriptor(input: {
    runId: string;
    attempt: ExecutionAttemptPassResult;
    successfulToolNames: string[];
}): CanonicalAttemptEvidenceDescriptor;
export declare function buildCanonicalRecoveredAttemptEvidenceDescriptor(input: {
    runId: string;
    continuationId: string;
    toolName: string;
    operationId: string;
    operationBindingHash: `sha256:${string}`;
    persistedToolResultContent: string;
    evidenceRefs?: readonly string[];
}): CanonicalAttemptEvidenceDescriptor;
interface PersistedAttemptReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
export declare function recordCanonicalAttemptEvidence(descriptor: CanonicalAttemptEvidenceDescriptor, dependencies: {
    issueReceipt: (input: Omit<CanonicalAttemptEvidenceDescriptor, "runId">) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedAttemptReceipt | undefined;
    applyAttemptTransition: (input: {
        runId: string;
        workId: string;
        receiptRef: string;
    }) => {
        status: string;
        reasonCode?: string | undefined;
    };
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=canonical-attempt-evidence.d.ts.map