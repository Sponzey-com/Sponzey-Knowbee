type Fingerprint = `sha256:${string}`;
export interface SideEffectReceiptEvidence {
    success: boolean;
    targetFingerprint: Fingerprint;
    resultFingerprint: Fingerprint;
    recordedAt: number;
    receiptRef: string;
}
export interface SideEffectObservationEvidence {
    available: boolean;
    targetFingerprint: Fingerprint;
    expectedStateFingerprint: Fingerprint;
    observedStateFingerprint: Fingerprint;
    capturedAt: number;
    receiptRef: string;
}
export type SideEffectVerificationDecision = {
    verified: true;
    receiptRefs: [string, string];
} | {
    verified: false;
    reasonCode: "adapter_failed" | "observation_unavailable" | "observation_target_mismatch" | "authorized_expectation_mismatch" | "observation_stale" | "post_state_mismatch";
};
export declare function decideSideEffectVerification(input: {
    effect: SideEffectReceiptEvidence;
    observation: SideEffectObservationEvidence;
    authorizedExpectedStateFingerprint?: Fingerprint | undefined;
}): SideEffectVerificationDecision;
export declare function decideResumedSideEffectVerification(input: {
    targetFingerprint: Fingerprint;
    authorizedExpectedStateFingerprint: Fingerprint;
    effectReceiptRef: string;
    observation: SideEffectObservationEvidence;
}): SideEffectVerificationDecision;
export type SideEffectRemediationDecision = {
    action: "none";
    reasonCode: "side_effect_verified";
} | {
    action: "compensate";
    reasonCode: "side_effect_verification_failed";
} | {
    action: "manual_intervention";
    reasonCode: "side_effect_irreversible";
};
export declare function decideSideEffectRemediation(input: SideEffectVerificationDecision & {
    compensationSupport: "reversible" | "irreversible";
}): SideEffectRemediationDecision;
export {};
//# sourceMappingURL=side-effect-verification.d.ts.map