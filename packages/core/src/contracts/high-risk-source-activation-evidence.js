export const HIGH_RISK_PERMISSION_CAPABILITIES = [
    "tool",
    "mcp",
    "filesystem",
    "network",
    "yeonjang",
];
function exact(value) {
    return value.trim();
}
function validChecksum(value) {
    return /^(?:sha256:)?[a-f0-9]{8,64}$/iu.test(exact(value));
}
export function verifyHighRiskSourceEvidence(input) {
    const changeId = exact(input.changeId);
    const sourceSetFingerprint = exact(input.expectedSourceSetFingerprint);
    const expectedRefs = input.expectedSourceRefs.map(exact).filter(Boolean);
    if (!changeId || !sourceSetFingerprint || expectedRefs.length === 0 || new Set(expectedRefs).size !== expectedRefs.length) {
        return { status: "blocked", reasonCode: "checksum_receipt_invalid" };
    }
    const permissions = new Map();
    for (const receipt of input.permissions) {
        if (!HIGH_RISK_PERMISSION_CAPABILITIES.includes(receipt.capability) || permissions.has(receipt.capability) || !exact(receipt.policyFingerprint) || !exact(receipt.evidenceRef)) {
            return { status: "blocked", reasonCode: "permission_receipt_invalid" };
        }
        if (exact(receipt.changeId) !== changeId)
            return { status: "blocked", reasonCode: "permission_scope_mismatch", capability: receipt.capability };
        permissions.set(receipt.capability, receipt);
    }
    for (const capability of HIGH_RISK_PERMISSION_CAPABILITIES) {
        const receipt = permissions.get(capability);
        if (!receipt)
            return { status: "blocked", reasonCode: "permission_missing", capability };
        if (!receipt.testPassed)
            return { status: "blocked", reasonCode: "permission_test_failed", capability };
        if (!receipt.policyPreserved)
            return { status: "blocked", reasonCode: "permission_policy_weakened", capability };
        if (receipt.approvalRequired && !receipt.approvalSatisfied) {
            return { status: "blocked", reasonCode: "permission_approval_unsatisfied", capability };
        }
    }
    const expected = new Set(expectedRefs);
    const checksums = new Map();
    for (const receipt of input.checksums) {
        const sourceRef = exact(receipt.sourceRef);
        if (!sourceRef || !exact(receipt.evidenceRef) || checksums.has(sourceRef) || !validChecksum(receipt.baselineChecksum) || !validChecksum(receipt.proposedChecksum)) {
            return { status: "blocked", reasonCode: "checksum_receipt_invalid", ...(sourceRef ? { sourceRef } : {}) };
        }
        if (exact(receipt.changeId) !== changeId)
            return { status: "blocked", reasonCode: "checksum_scope_mismatch", sourceRef };
        if (!expected.has(sourceRef))
            return { status: "blocked", reasonCode: "checksum_source_unexpected", sourceRef };
        if (exact(receipt.sourceSetFingerprint) !== sourceSetFingerprint) {
            return { status: "blocked", reasonCode: "checksum_fingerprint_mismatch", sourceRef };
        }
        if (exact(receipt.baselineChecksum) === exact(receipt.proposedChecksum)) {
            return { status: "blocked", reasonCode: "checksum_unchanged", sourceRef };
        }
        checksums.set(sourceRef, receipt);
    }
    for (const sourceRef of expectedRefs) {
        if (!checksums.has(sourceRef))
            return { status: "blocked", reasonCode: "checksum_source_missing", sourceRef };
    }
    return {
        status: "verified",
        changeId,
        sourceSetFingerprint,
        permissionCapabilities: HIGH_RISK_PERMISSION_CAPABILITIES,
        sourceRefs: expectedRefs,
    };
}
export function projectPromptActivation(decision) {
    if (decision.status !== "authorized")
        return { status: "pending", reasonCode: decision.reasonCode };
    return {
        status: "active",
        activationRunId: decision.activation.activationRunId,
        runtimeSnapshotFingerprint: decision.activation.nextRuntimeSnapshotFingerprint,
        method: decision.activation.method,
    };
}
export async function publishConfirmedPromptActivation(input) {
    if (input.projection.status !== "active")
        return input.projection;
    return { status: "published", result: await input.publish(input.projection) };
}
//# sourceMappingURL=high-risk-source-activation-evidence.js.map