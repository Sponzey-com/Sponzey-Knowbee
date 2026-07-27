export function decideSideEffectVerification(input) {
    if (!input.effect.success)
        return { verified: false, reasonCode: "adapter_failed" };
    if (!input.observation.available)
        return { verified: false, reasonCode: "observation_unavailable" };
    if (input.observation.targetFingerprint !== input.effect.targetFingerprint) {
        return { verified: false, reasonCode: "observation_target_mismatch" };
    }
    if (input.authorizedExpectedStateFingerprint !== undefined &&
        input.observation.expectedStateFingerprint !== input.authorizedExpectedStateFingerprint) {
        return { verified: false, reasonCode: "authorized_expectation_mismatch" };
    }
    if (input.observation.capturedAt < input.effect.recordedAt) {
        return { verified: false, reasonCode: "observation_stale" };
    }
    if (input.observation.observedStateFingerprint !== input.observation.expectedStateFingerprint) {
        return { verified: false, reasonCode: "post_state_mismatch" };
    }
    return {
        verified: true,
        receiptRefs: [input.effect.receiptRef, input.observation.receiptRef],
    };
}
export function decideResumedSideEffectVerification(input) {
    if (!input.observation.available)
        return { verified: false, reasonCode: "observation_unavailable" };
    if (input.observation.targetFingerprint !== input.targetFingerprint) {
        return { verified: false, reasonCode: "observation_target_mismatch" };
    }
    if (input.observation.expectedStateFingerprint !== input.authorizedExpectedStateFingerprint) {
        return { verified: false, reasonCode: "authorized_expectation_mismatch" };
    }
    if (input.observation.observedStateFingerprint !== input.observation.expectedStateFingerprint) {
        return { verified: false, reasonCode: "post_state_mismatch" };
    }
    return {
        verified: true,
        receiptRefs: [input.effectReceiptRef, input.observation.receiptRef],
    };
}
export function decideSideEffectRemediation(input) {
    if (input.verified)
        return { action: "none", reasonCode: "side_effect_verified" };
    return input.compensationSupport === "reversible"
        ? { action: "compensate", reasonCode: "side_effect_verification_failed" }
        : { action: "manual_intervention", reasonCode: "side_effect_irreversible" };
}
//# sourceMappingURL=side-effect-verification.js.map