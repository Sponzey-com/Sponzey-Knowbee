type Fingerprint = `sha256:${string}`

export interface SideEffectReceiptEvidence {
  success: boolean
  targetFingerprint: Fingerprint
  resultFingerprint: Fingerprint
  recordedAt: number
  receiptRef: string
}

export interface SideEffectObservationEvidence {
  available: boolean
  targetFingerprint: Fingerprint
  expectedStateFingerprint: Fingerprint
  observedStateFingerprint: Fingerprint
  capturedAt: number
  receiptRef: string
}

export type SideEffectVerificationDecision =
  | { verified: true; receiptRefs: [string, string] }
  | {
      verified: false
      reasonCode:
        | "adapter_failed"
        | "observation_unavailable"
        | "observation_target_mismatch"
        | "authorized_expectation_mismatch"
        | "observation_stale"
        | "post_state_mismatch"
    }

export function decideSideEffectVerification(input: {
  effect: SideEffectReceiptEvidence
  observation: SideEffectObservationEvidence
  authorizedExpectedStateFingerprint?: Fingerprint | undefined
}): SideEffectVerificationDecision {
  if (!input.effect.success) return { verified: false, reasonCode: "adapter_failed" }
  if (!input.observation.available)
    return { verified: false, reasonCode: "observation_unavailable" }
  if (input.observation.targetFingerprint !== input.effect.targetFingerprint) {
    return { verified: false, reasonCode: "observation_target_mismatch" }
  }
  if (
    input.authorizedExpectedStateFingerprint !== undefined &&
    input.observation.expectedStateFingerprint !== input.authorizedExpectedStateFingerprint
  ) {
    return { verified: false, reasonCode: "authorized_expectation_mismatch" }
  }
  if (input.observation.capturedAt < input.effect.recordedAt) {
    return { verified: false, reasonCode: "observation_stale" }
  }
  if (input.observation.observedStateFingerprint !== input.observation.expectedStateFingerprint) {
    return { verified: false, reasonCode: "post_state_mismatch" }
  }
  return {
    verified: true,
    receiptRefs: [input.effect.receiptRef, input.observation.receiptRef],
  }
}

export function decideResumedSideEffectVerification(input: {
  targetFingerprint: Fingerprint
  authorizedExpectedStateFingerprint: Fingerprint
  effectReceiptRef: string
  observation: SideEffectObservationEvidence
}): SideEffectVerificationDecision {
  if (!input.observation.available)
    return { verified: false, reasonCode: "observation_unavailable" }
  if (input.observation.targetFingerprint !== input.targetFingerprint) {
    return { verified: false, reasonCode: "observation_target_mismatch" }
  }
  if (input.observation.expectedStateFingerprint !== input.authorizedExpectedStateFingerprint) {
    return { verified: false, reasonCode: "authorized_expectation_mismatch" }
  }
  if (input.observation.observedStateFingerprint !== input.observation.expectedStateFingerprint) {
    return { verified: false, reasonCode: "post_state_mismatch" }
  }
  return {
    verified: true,
    receiptRefs: [input.effectReceiptRef, input.observation.receiptRef],
  }
}

export type SideEffectRemediationDecision =
  | { action: "none"; reasonCode: "side_effect_verified" }
  | { action: "compensate"; reasonCode: "side_effect_verification_failed" }
  | { action: "manual_intervention"; reasonCode: "side_effect_irreversible" }

export function decideSideEffectRemediation(
  input: SideEffectVerificationDecision & { compensationSupport: "reversible" | "irreversible" },
): SideEffectRemediationDecision {
  if (input.verified) return { action: "none", reasonCode: "side_effect_verified" }
  return input.compensationSupport === "reversible"
    ? { action: "compensate", reasonCode: "side_effect_verification_failed" }
    : { action: "manual_intervention", reasonCode: "side_effect_irreversible" }
}
