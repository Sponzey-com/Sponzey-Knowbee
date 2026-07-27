export function evaluateCanonicalRecoveryStrategyAdmission(input) {
    return input.attemptedStrategyFingerprints.has(input.nextStrategyFingerprint)
        ? { ok: false, reasonCode: "recovery_strategy_unchanged" }
        : { ok: true };
}
//# sourceMappingURL=canonical-recovery-strategy-admission.js.map