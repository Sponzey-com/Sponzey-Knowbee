export type CanonicalRecoveryStrategyAdmission = {
    ok: true;
} | {
    ok: false;
    reasonCode: "recovery_strategy_unchanged";
};
export declare function evaluateCanonicalRecoveryStrategyAdmission(input: {
    attemptedStrategyFingerprints: ReadonlySet<string>;
    nextStrategyFingerprint: string;
}): CanonicalRecoveryStrategyAdmission;
//# sourceMappingURL=canonical-recovery-strategy-admission.d.ts.map