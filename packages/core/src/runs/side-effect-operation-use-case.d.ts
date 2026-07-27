import { type SideEffectOperationEvent, type SideEffectOperationIdentity, type SideEffectOperationReceipt, type SideEffectOperationState } from "../contracts/side-effect-operation.js";
export interface SideEffectOperationTransitionRecord {
    revision: number;
    previousState: SideEffectOperationState;
    event: SideEffectOperationEvent;
    nextState: SideEffectOperationState;
    receiptRef: string;
}
export interface SideEffectOperationAggregate {
    identity: SideEffectOperationIdentity;
    state: SideEffectOperationState;
    revision: number;
    transitions: SideEffectOperationTransitionRecord[];
}
export interface SideEffectOperationRepository {
    loadByScope(scopeId: string): SideEffectOperationAggregate | undefined;
    create(aggregate: SideEffectOperationAggregate): {
        created: true;
    } | {
        created: false;
        reasonCode: "scope_conflict";
    };
    loadReceipt(receiptId: string): SideEffectOperationReceipt | undefined;
    saveTransition(input: {
        aggregate: SideEffectOperationAggregate;
        expectedRevision: number;
        receipt: SideEffectOperationReceipt;
    }): {
        saved: true;
    } | {
        saved: false;
        reasonCode: "revision_conflict" | "receipt_conflict" | "receipt_invalid";
        currentRevision: number;
    };
}
export type ReserveSideEffectOperationResult = {
    status: "reserved" | "existing";
    aggregate: SideEffectOperationAggregate;
} | {
    status: "rejected";
    reasonCode: "operation_scope_params_conflict" | "operation_scope_persistence_conflict";
};
export declare function reserveSideEffectOperation(input: {
    repository: SideEffectOperationRepository;
    identity: SideEffectOperationIdentity;
}): ReserveSideEffectOperationResult;
export type TransitionSideEffectOperationResult = {
    status: "applied";
    aggregate: SideEffectOperationAggregate;
} | {
    status: "rejected";
    reasonCode: "operation_not_found" | "operation_identity_mismatch" | "stale_revision" | "receipt_required" | "transition_not_allowed" | "terminal_state_locked" | "revision_conflict" | "typed_receipt_required" | "receipt_conflict" | "receipt_invalid";
    currentRevision?: number;
};
export declare function transitionReservedSideEffectOperation(input: {
    repository: SideEffectOperationRepository;
    operationId: string;
    scopeId: string;
    expectedRevision: number;
    event: SideEffectOperationEvent;
    receipt: SideEffectOperationReceipt;
}): TransitionSideEffectOperationResult;
//# sourceMappingURL=side-effect-operation-use-case.d.ts.map