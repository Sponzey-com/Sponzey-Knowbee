export type YeonjangPairingExecutionAdmissionBinding = {
  readonly extensionId: string
}

export interface YeonjangPairingVerificationPort {
  verify(input: {
    readonly instanceId: string
    readonly pairingSecret: string
  }):
    | { readonly ok: true; readonly binding: YeonjangPairingExecutionAdmissionBinding }
    | { readonly ok: false; readonly reasonCode: string }
}

export interface YeonjangExecutionAdmissionKeyProvisionerPort {
  provision(input: { readonly extensionId: string }):
    | { readonly ok: true }
    | { readonly ok: false; readonly reasonCode: string }
  remove(input: { readonly extensionId: string }): { readonly ok: true } | { readonly ok: false }
}

export interface YeonjangPairingTrustCommitterPort {
  approve(input: { readonly instanceId: string }): { readonly ok: true } | { readonly ok: false; readonly reasonCode: string }
}

export type YeonjangPairingExecutionAdmissionProvisioningResult =
  | { readonly ok: true; readonly executionAdmissionKeyStatus: "ready" }
  | {
      readonly ok: false
      readonly reasonCode:
        | "pairing_verification_failed"
        | "execution_admission_key_provision_failed"
        | "pairing_trust_commit_failed"
        | "pairing_trust_commit_compensation_failed"
    }

export function approveYeonjangPairingWithExecutionAdmissionKey(input: {
  readonly instanceId: string
  readonly pairingSecret: string
  readonly verifier: YeonjangPairingVerificationPort
  readonly keyProvisioner: YeonjangExecutionAdmissionKeyProvisionerPort
  readonly trustCommitter: YeonjangPairingTrustCommitterPort
}): YeonjangPairingExecutionAdmissionProvisioningResult {
  const instanceId = input.instanceId.trim()
  const pairingSecret = input.pairingSecret.trim()
  if (!instanceId || !pairingSecret) return { ok: false, reasonCode: "pairing_verification_failed" }
  const verification = input.verifier.verify({ instanceId, pairingSecret })
  if (!verification.ok) return { ok: false, reasonCode: "pairing_verification_failed" }
  const provisioned = input.keyProvisioner.provision({
    extensionId: verification.binding.extensionId,
  })
  if (!provisioned.ok) {
    return { ok: false, reasonCode: "execution_admission_key_provision_failed" }
  }
  const committed = input.trustCommitter.approve({ instanceId })
  if (committed.ok) return { ok: true, executionAdmissionKeyStatus: "ready" }
  const compensation = input.keyProvisioner.remove({ extensionId: verification.binding.extensionId })
  return compensation.ok
    ? { ok: false, reasonCode: "pairing_trust_commit_failed" }
    : { ok: false, reasonCode: "pairing_trust_commit_compensation_failed" }
}
