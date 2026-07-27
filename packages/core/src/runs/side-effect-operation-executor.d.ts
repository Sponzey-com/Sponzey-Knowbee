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
    status: "manual_intervention";
    reasonCode: string;
    aggregate: SideEffectOperationAggregate;
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
    }>;
    observePostState: (value: T) => Promise<Omit<SideEffectObservationEvidence, "receiptRef">>;
    observeCurrentPostState?: (() => Promise<Omit<SideEffectObservationEvidence, "receiptRef">>) | undefined;
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