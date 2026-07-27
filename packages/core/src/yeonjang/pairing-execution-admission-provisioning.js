export function approveYeonjangPairingWithExecutionAdmissionKey(input) {
    const instanceId = input.instanceId.trim();
    const pairingSecret = input.pairingSecret.trim();
    if (!instanceId || !pairingSecret)
        return { ok: false, reasonCode: "pairing_verification_failed" };
    const verification = input.verifier.verify({ instanceId, pairingSecret });
    if (!verification.ok)
        return { ok: false, reasonCode: "pairing_verification_failed" };
    const provisioned = input.keyProvisioner.provision({
        extensionId: verification.binding.extensionId,
    });
    if (!provisioned.ok) {
        return { ok: false, reasonCode: "execution_admission_key_provision_failed" };
    }
    const committed = input.trustCommitter.approve({ instanceId });
    if (committed.ok)
        return { ok: true, executionAdmissionKeyStatus: "ready" };
    const compensation = input.keyProvisioner.remove({ extensionId: verification.binding.extensionId });
    return compensation.ok
        ? { ok: false, reasonCode: "pairing_trust_commit_failed" }
        : { ok: false, reasonCode: "pairing_trust_commit_compensation_failed" };
}
//# sourceMappingURL=pairing-execution-admission-provisioning.js.map