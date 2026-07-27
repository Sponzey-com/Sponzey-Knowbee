export declare const SIDE_EFFECT_OPERATION_STATES: readonly ["RESERVED", "EFFECT_STARTED", "EFFECT_RECORDED", "VERIFYING", "VERIFIED", "VERIFY_FAILED", "CANCEL_REQUESTED", "COMPENSATING", "COMPENSATED", "MANUAL_INTERVENTION"];
export type SideEffectOperationState = (typeof SIDE_EFFECT_OPERATION_STATES)[number];
export declare const SIDE_EFFECT_OPERATION_EVENTS: readonly ["START_EFFECT", "RECORD_EFFECT", "BEGIN_VERIFICATION", "VERIFICATION_PASSED", "VERIFICATION_FAILED", "REQUEST_CANCEL", "BEGIN_COMPENSATION", "COMPENSATION_SUCCEEDED", "COMPENSATION_FAILED", "MARK_MANUAL"];
export type SideEffectOperationEvent = (typeof SIDE_EFFECT_OPERATION_EVENTS)[number];
export declare const SIDE_EFFECT_RECEIPT_KINDS: readonly ["authorization", "effect", "observation", "cancellation", "compensation", "manual"];
export type SideEffectReceiptKind = (typeof SIDE_EFFECT_RECEIPT_KINDS)[number];
export declare const SIDE_EFFECT_EVENT_RECEIPT_KIND: Readonly<Record<SideEffectOperationEvent, SideEffectReceiptKind>>;
export interface SideEffectOperationReceipt {
    schemaVersion: 1;
    receiptId: string;
    operationId: string;
    workId: string;
    event: SideEffectOperationEvent;
    kind: SideEffectReceiptKind;
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
    operationRevision: number;
    issuedAt: number;
}
export declare const SIDE_EFFECT_CLASSES: readonly ["read_only", "local_write", "external_write", "destructive", "financial"];
export type SideEffectClass = (typeof SIDE_EFFECT_CLASSES)[number];
export interface SideEffectOperationIdentity {
    operationId: string;
    scopeId: string;
    runId: string;
    workId: string;
    stepKey: string;
    adapterId: string;
    targetFingerprint: `sha256:${string}`;
    paramsFingerprint: `sha256:${string}`;
}
export interface SideEffectOperationAuthorization {
    authorized: true;
    policyDecisionId: string;
    policyReceiptRef: string;
    operationId: string;
    runId: string;
    adapterId: string;
    effectClass: Exclude<SideEffectClass, "read_only">;
    targetFingerprint: `sha256:${string}`;
    paramsFingerprint: `sha256:${string}`;
    scopeFingerprint: `sha256:${string}`;
    expectedEffectFingerprint: `sha256:${string}`;
}
export declare function validateSideEffectOperationReceipt(input: {
    receipt: SideEffectOperationReceipt;
    identity: SideEffectOperationIdentity;
    event: SideEffectOperationEvent;
    operationRevision: number;
}): {
    ok: true;
} | {
    ok: false;
    reasonCode: string;
};
export declare function buildSideEffectOperationReceipt(input: {
    identity: SideEffectOperationIdentity;
    event: SideEffectOperationEvent;
    operationRevision: number;
    evidenceFingerprint: `sha256:${string}`;
    evidenceRefs: string[];
    issuedAt: number;
}): SideEffectOperationReceipt;
export declare function buildSideEffectOperationIdentity(input: Omit<SideEffectOperationIdentity, "operationId" | "scopeId">): SideEffectOperationIdentity;
export declare function buildSideEffectOperationAuthorization(input: {
    identity: SideEffectOperationIdentity;
    policyDecisionId: string;
    policyReceiptRef: string;
    effectClass: Exclude<SideEffectClass, "read_only">;
    scopeFingerprint: `sha256:${string}`;
    expectedEffectFingerprint: `sha256:${string}`;
}): SideEffectOperationAuthorization;
export declare function validateSideEffectOperationAuthorization(input: {
    identity: SideEffectOperationIdentity;
    authorization: SideEffectOperationAuthorization | undefined;
}): {
    authorized: true;
    authorization: SideEffectOperationAuthorization;
} | {
    authorized: false;
    reasonCode: string;
};
export type SideEffectOperationTransitionDecision = {
    accepted: true;
    previousState: SideEffectOperationState;
    event: SideEffectOperationEvent;
    nextState: SideEffectOperationState;
    receiptRef: string;
} | {
    accepted: false;
    state: SideEffectOperationState;
    event: SideEffectOperationEvent;
    reasonCode: "receipt_required" | "transition_not_allowed" | "terminal_state_locked";
};
export declare function transitionSideEffectOperation(input: {
    state: SideEffectOperationState;
    event: SideEffectOperationEvent;
    receiptRef: string;
}): SideEffectOperationTransitionDecision;
//# sourceMappingURL=side-effect-operation.d.ts.map