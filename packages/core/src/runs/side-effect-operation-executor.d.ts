import { type SideEffectOperationAuthorization, type SideEffectOperationIdentity, type SideEffectOperationReceipt } from "../contracts/side-effect-operation.js";
import { type SideEffectOperationAggregate, type SideEffectOperationRepository, transitionReservedSideEffectOperation } from "./side-effect-operation-use-case.js";
import { type SideEffectObservationEvidence } from "./side-effect-verification.js";
type Fingerprint = `sha256:${string}`;
export type SideEffectOperationExecutionResult<T> = {
    status: "verified";
    value: T;
    aggregate: SideEffectOperationAggregate;
} | {
    status: "duplicate_verified";
    aggregate: SideEffectOperationAggregate;
} | {
    status: "resumed_verified";
    aggregate: SideEffectOperationAggregate;
} | {
    status: "cancelled_before_effect";
    aggregate: SideEffectOperationAggregate;
} | {
    status: "compensated";
    aggregate: SideEffectOperationAggregate;
} | {
    status: "effect_rejected";
    reasonCode: string;
    aggregate: SideEffectOperationAggregate;
} | {
    status: "manual_intervention";
    reasonCode: string;
    aggregate: SideEffectOperationAggregate;
    recoveryEvidence?: unknown;
    priorReceiptRef?: string;
} | {
    status: "blocked";
    reasonCode: string;
    aggregate?: SideEffectOperationAggregate;
};
export declare function executeSideEffectOperation<T>(input: {
    identity: SideEffectOperationIdentity;
    compensationSupport: "reversible" | "irreversible";
    executeEffect: () => Promise<{
        value: T;
        success: boolean;
        resultFingerprint: Fingerprint;
        recordedAt: number;
        effectEvidenceRefs?: readonly string[];
        preEffectRejection?: {
            reasonCode: string;
            retrySafety: "safe_same_command" | "change_strategy";
        };
    }>;
    observePostState: (value: T) => Promise<Omit<SideEffectObservationEvidence, "receiptRef"> & {
        recoveryEvidence?: unknown;
    }>;
    observeCurrentPostState?: ((input: {
        effectEvidenceRefs: readonly string[];
    }) => Promise<Omit<SideEffectObservationEvidence, "receiptRef"> & {
        recoveryEvidence?: unknown;
    }>) | undefined;
    compensate?: ((value: T) => Promise<{
        success: boolean;
        receiptEvidence: unknown;
    }>) | undefined;
    verifyCompensation?: (() => Promise<{
        verified: boolean;
        receiptEvidence: unknown;
    }>) | undefined;
}, dependencies: {
    repository: SideEffectOperationRepository;
    authorization?: SideEffectOperationAuthorization | undefined;
    createReceipt: (input: {
        identity: SideEffectOperationIdentity;
        event: Parameters<typeof transitionReservedSideEffectOperation>[0]["event"];
        operationRevision: number;
        evidence?: unknown;
    }) => SideEffectOperationReceipt;
    isCancelled: () => boolean;
}): Promise<SideEffectOperationExecutionResult<T>>;
export {};
//# sourceMappingURL=side-effect-operation-executor.d.ts.map