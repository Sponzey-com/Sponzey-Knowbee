import type { CanonicalTerminalCause } from "../contracts/canonical-work-receipt.js";
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js";
import type { ApprovalOperationBinding } from "./approval-registry.js";
export type CanonicalApprovalEvent = Extract<CanonicalWorkEvent, "APPROVAL_REQUESTED" | "APPROVAL_CONSUMED" | "APPROVAL_DENIED_OR_EXPIRED">;
export interface CanonicalApprovalTransitionDescriptor {
    readonly runId: string;
    readonly workId: string;
    readonly event: CanonicalApprovalEvent;
    readonly receiptId: string;
    readonly kind: "approval";
    readonly evidenceFingerprint: `sha256:${string}`;
    readonly evidenceRefs: readonly [string, string];
    readonly terminalCause?: CanonicalTerminalCause;
}
export declare function buildCanonicalApprovalTransitionDescriptor(input: {
    runId: string;
    approvalId: string;
    event: CanonicalApprovalEvent;
    operationBinding: ApprovalOperationBinding;
}): CanonicalApprovalTransitionDescriptor;
interface PersistedApprovalReceipt {
    readonly workId: string;
    readonly kind: string;
    readonly evidenceFingerprint: string;
    readonly evidenceRefs: readonly string[];
    readonly consumedRevision?: number;
    readonly terminalCause?: CanonicalTerminalCause;
}
export declare function recordCanonicalApprovalTransition(descriptor: CanonicalApprovalTransitionDescriptor, dependencies: {
    issueReceipt: (input: {
        receiptId: string;
        workId: string;
        kind: "approval";
        evidenceFingerprint: `sha256:${string}`;
        evidenceRefs: string[];
        terminalCause?: CanonicalTerminalCause;
    }) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedApprovalReceipt | undefined;
    applyTransition: (input: {
        runId: string;
        workId: string;
        event: CanonicalApprovalEvent;
        receiptRef: string;
    }) => {
        status: string;
        reasonCode?: string;
    };
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=canonical-approval-transition.d.ts.map