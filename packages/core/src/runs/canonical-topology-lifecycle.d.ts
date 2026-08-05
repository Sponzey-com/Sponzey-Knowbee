import type { CanonicalWorkReceiptKind } from "../contracts/canonical-work-receipt.js";
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js";
import type { TopologyRootRunExecutionResult, TopologyRootRunRoutingDecision } from "../topology-runtime/harness.js";
type TopologyRoute = Extract<TopologyRootRunRoutingDecision, {
    mode: "route";
}>;
interface LifecycleReceipt {
    receiptId: string;
    workId: string;
    kind: CanonicalWorkReceiptKind;
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
}
interface PersistedReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
}
declare function recordSequence(input: {
    runId: string;
    workId: string;
    startRevision: number;
    receipts: readonly LifecycleReceipt[];
    events: readonly CanonicalWorkEvent[];
}, dependencies: {
    issueReceipt: (receipt: LifecycleReceipt) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedReceipt | undefined;
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
export interface CanonicalTopologyAdmissionDescriptor {
    runId: string;
    workId: string;
    receipts: readonly [LifecycleReceipt, LifecycleReceipt, LifecycleReceipt];
}
export declare function buildCanonicalTopologyAdmissionDescriptor(input: {
    runId: string;
    route: TopologyRoute;
    requestDiagnosisReceiptId: string;
    solutionPlanReceiptId: string;
    cancellationTokenId: string;
    signalAborted: boolean;
}): {
    ok: true;
    descriptor: CanonicalTopologyAdmissionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
export declare function recordCanonicalTopologyAdmission(descriptor: CanonicalTopologyAdmissionDescriptor, dependencies: Parameters<typeof recordSequence>[1]): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export interface CanonicalTopologyResultDescriptor {
    runId: string;
    workId: string;
    attemptReceipt: LifecycleReceipt;
    verificationReceipt?: LifecycleReceipt | undefined;
    verificationEvent?: "ALL_CRITERIA_VERIFIED" | "SOME_CRITERIA_VERIFIED" | undefined;
    terminalReceipt?: LifecycleReceipt | undefined;
    terminalEvent?: "POLICY_BLOCKED" | "PATHS_EXHAUSTED" | undefined;
    finalOutcome?: "blocked" | "exhausted" | undefined;
}
export declare function buildCanonicalTopologyResultDescriptor(input: {
    runId: string;
    result: TopologyRootRunExecutionResult;
    resultDiagnosisReceiptId?: string | undefined;
}): {
    ok: true;
    descriptor: CanonicalTopologyResultDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
export declare function recordCanonicalTopologyResult(descriptor: CanonicalTopologyResultDescriptor, dependencies: Parameters<typeof recordSequence>[1]): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=canonical-topology-lifecycle.d.ts.map