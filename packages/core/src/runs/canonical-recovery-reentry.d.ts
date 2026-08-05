import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js";
import type { CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js";
import type { CanonicalRecoveryReentryInput } from "./execution-cycle-pass.js";
export interface CanonicalRecoveryReceiptDescriptor {
    receiptId: string;
    workId: string;
    kind: CanonicalWorkReceiptKind;
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
export interface CanonicalRecoveryReentryDescriptor {
    runId: string;
    workId: string;
    strategyFingerprint: `sha256:${string}`;
    recoveryFingerprint: `sha256:${string}`;
    receipts: readonly [
        CanonicalRecoveryReceiptDescriptor,
        CanonicalRecoveryReceiptDescriptor,
        CanonicalRecoveryReceiptDescriptor
    ];
}
export declare function buildCanonicalRecoveryReentryDescriptor(input: CanonicalRecoveryReentryInput & {
    allowedTargetIds: ReadonlySet<string>;
    allowedProviderIds?: ReadonlySet<string> | undefined;
    cancellationTokenId: string;
    signalAborted: boolean;
}): {
    ok: true;
    descriptor: CanonicalRecoveryReentryDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
interface PersistedRecoveryReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
export declare function recordCanonicalRecoveryReentry(descriptor: CanonicalRecoveryReentryDescriptor, startRevision: number, dependencies: {
    issueReceipt: (input: CanonicalRecoveryReceiptDescriptor) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedRecoveryReceipt | undefined;
    applyTransition: (input: {
        runId: string;
        workId: string;
        expectedRevision: number;
        event: CanonicalWorkEvent;
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
//# sourceMappingURL=canonical-recovery-reentry.d.ts.map