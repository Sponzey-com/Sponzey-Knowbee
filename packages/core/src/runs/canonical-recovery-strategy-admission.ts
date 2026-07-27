export type CanonicalRecoveryStrategyAdmission =
  | { ok: true }
  | { ok: false; reasonCode: "recovery_strategy_unchanged" }

export function evaluateCanonicalRecoveryStrategyAdmission(input: {
  attemptedStrategyFingerprints: ReadonlySet<string>
  nextStrategyFingerprint: string
}): CanonicalRecoveryStrategyAdmission {
  return input.attemptedStrategyFingerprints.has(input.nextStrategyFingerprint)
    ? { ok: false, reasonCode: "recovery_strategy_unchanged" }
    : { ok: true }
}
