import type { CompletionReviewContextReceipt, CompletionReviewExpectedCondition, CompletionReviewResult } from "../agent/completion-review.js";
import type { CanonicalTerminalCause } from "../contracts/canonical-work-receipt.js";
import type { CanonicalWorkEvent } from "../contracts/canonical-work-state.js";
import type { FinalDeliveryCommitResult } from "./channel-finalizer.js";
import type { CompletionApplicationDecision } from "./completion-application.js";
import type { CompletionStageState } from "./completion-state.js";
import type { UserFacingTextSource } from "./loop-directive.js";
import type { CanonicalFinalOutcome } from "./canonical-work-run-projection.js";
import type { CanonicalWaitingKind } from "./canonical-work-run-projection.js";
type CanonicalFinalizationReceiptKind = "verification" | "exhaustion" | "blocker" | "input_requirement" | "policy" | "cancellation" | "delivery";
export interface CanonicalFinalizationReceiptDescriptor {
    receiptId: string;
    workId: string;
    kind: CanonicalFinalizationReceiptKind;
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
    evidence?: CanonicalFinalizationEvidenceMap | undefined;
    terminalCause?: CanonicalTerminalCause;
}
export interface CanonicalFinalizationEvidenceMap {
    criterionEvidenceRefs?: Array<{
        criterionKey: string;
        evidenceRefs: string[];
    }> | undefined;
    conditionEvidenceRefs?: Array<{
        conditionId: string;
        evidenceRefs: string[];
    }> | undefined;
}
export interface CanonicalFinalizationTransitionDescriptor {
    runId: string;
    workId: string;
    event: Extract<CanonicalWorkEvent, "ALL_CRITERIA_VERIFIED" | "PATHS_EXHAUSTED" | "RESULT_BLOCKED" | "INPUT_REQUIRED" | "POLICY_BLOCKED" | "USER_CANCELLED" | "REPORT_DELIVERED">;
    receipt: CanonicalFinalizationReceiptDescriptor;
    finalOutcome?: CanonicalFinalOutcome | undefined;
    waitingKind?: CanonicalWaitingKind | undefined;
}
export declare function buildCanonicalPolicyBlockedDescriptor(input: {
    runId: string;
    reasonCode: string;
    policyFingerprint: `sha256:${string}`;
    capabilityRefs: string[];
    safeAlternativesExhausted: boolean;
}): {
    ok: true;
    descriptor: CanonicalFinalizationTransitionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
export declare function buildCanonicalCancellationDescriptor(input: {
    runId: string;
    cancellationKind: "user_requested" | "runtime_abort";
    cancellationTokenId: string;
    signalAborted: boolean;
}): {
    ok: true;
    descriptor: CanonicalFinalizationTransitionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
export declare function buildCanonicalRecoveredDeliveryDescriptor(input: {
    runId: string;
    finalOutcome: CanonicalFinalOutcome;
    committedLedgerEventId: string;
    deliveryKey: string;
    idempotencyKey: string;
}): {
    ok: true;
    descriptor: CanonicalFinalizationTransitionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
interface PersistedFinalizationReceipt {
    workId: string;
    kind: string;
    evidenceFingerprint: string;
    evidenceRefs: string[];
    consumedRevision?: number | undefined;
    terminalCause?: CanonicalTerminalCause | undefined;
}
export interface CanonicalFinalizationTransitionDependencies {
    issueReceipt: (receipt: CanonicalFinalizationReceiptDescriptor) => {
        issued: true;
    } | {
        issued: false;
        reasonCode: string;
    };
    loadReceipt: (receiptId: string) => PersistedFinalizationReceipt | undefined;
    applyTransition: (input: {
        runId: string;
        workId: string;
        event: CanonicalFinalizationTransitionDescriptor["event"];
        receiptRef: string;
        finalOutcome?: CanonicalFinalOutcome | undefined;
        waitingKind?: CanonicalWaitingKind | undefined;
    }) => {
        status: string;
        reasonCode?: string | undefined;
    };
}
export declare function buildCanonicalPolicyInputRequiredDescriptor(input: {
    runId: string;
    reasonCode: string;
    policyFingerprint: `sha256:${string}`;
    capabilityRefs: string[];
    waitingKind: CanonicalWaitingKind;
}): {
    ok: true;
    descriptor: CanonicalFinalizationTransitionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
export declare function buildCanonicalCompletionOutcomeDescriptor(input: {
    runId: string;
    review: CompletionReviewResult | null;
    requiresLlmResultDiagnosis?: boolean;
    expectedLlmDiagnosisContext?: CompletionReviewContextReceipt;
    expectedLlmDiagnosisConditions?: CompletionReviewExpectedCondition[];
    state: CompletionStageState;
    application: CompletionApplicationDecision;
    preview: string;
}): {
    ok: true;
    descriptor: CanonicalFinalizationTransitionDescriptor | null;
} | {
    ok: false;
    reasonCode: string;
};
export declare function buildCanonicalDeliveryDescriptor(input: {
    runId: string;
    source: string;
    sessionId: string;
    text: string;
    textSource: UserFacingTextSource;
    finalOutcome: CanonicalFinalOutcome;
    delivery: Pick<FinalDeliveryCommitResult, "status" | "deliveryKey" | "idempotencyKey" | "existingEventId">;
}): {
    ok: true;
    descriptor: CanonicalFinalizationTransitionDescriptor;
} | {
    ok: false;
    reasonCode: string;
};
export declare function recordCanonicalFinalizationTransition(descriptor: CanonicalFinalizationTransitionDescriptor, dependencies: CanonicalFinalizationTransitionDependencies): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export {};
//# sourceMappingURL=canonical-finalization-lifecycle.d.ts.map