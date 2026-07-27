import type { TaskIntakeResult } from "../agent/intake.js";
export interface CanonicalExecutionAdmissionDescriptor {
    runId: string;
    workId: string;
    receiptId: string;
    kind: "execution";
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
export declare function buildCanonicalExecutionAdmissionDescriptor(input: {
    runId: string;
    intake: TaskIntakeResult;
    executorId: string;
    cancellationTokenId: string;
    signalAborted: boolean;
}): {
    ok: true;
    descriptor: CanonicalExecutionAdmissionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
interface PersistedExecutionReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
export declare function recordCanonicalExecutionAdmission(descriptor: CanonicalExecutionAdmissionDescriptor, dependencies: {
    issueReceipt: (input: Omit<CanonicalExecutionAdmissionDescriptor, "runId">) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedExecutionReceipt | undefined;
    applyExecutionTransition: (input: {
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
//# sourceMappingURL=canonical-execution-admission.d.ts.map