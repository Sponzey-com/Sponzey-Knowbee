function exact(value) {
    return value.trim();
}
export function authorizePreActivationTests(input) {
    const required = input.requiredTestIds.map(exact);
    if (required.length === 0 || required.some((testId) => !testId) || new Set(required).size !== required.length) {
        return { status: "blocked", reasonCode: "activation_test_invalid" };
    }
    const receipts = new Map();
    for (const receipt of input.receipts) {
        if (!exact(receipt.testId) || receipts.has(receipt.testId) || !exact(receipt.evidenceRef)) {
            return { status: "blocked", reasonCode: "activation_test_invalid" };
        }
        receipts.set(receipt.testId, receipt);
    }
    for (const testId of required) {
        const receipt = receipts.get(testId);
        if (!receipt)
            return { status: "blocked", reasonCode: "activation_test_missing" };
        if (receipt.status !== "passed")
            return { status: "blocked", reasonCode: "activation_test_failed" };
        if (receipt.sourceRef !== input.sourceRef || receipt.sourceVersion !== input.sourceVersion || receipt.sourceChecksum !== input.sourceChecksum) {
            return { status: "blocked", reasonCode: "activation_test_lineage_mismatch" };
        }
        if (!Number.isSafeInteger(receipt.executedAt) || receipt.executedAt < input.sourceWrittenAt || receipt.executedAt >= input.activatedAt) {
            return { status: "blocked", reasonCode: "activation_test_time_invalid" };
        }
    }
    return { status: "authorized", testIds: required, evidenceRefs: required.map((testId) => receipts.get(testId).evidenceRef) };
}
export function authorizeCompletePromptActivation(input) {
    if (input.activation.status !== "authorized")
        return { status: "blocked", reasonCode: "activation_evidence_blocked" };
    if (input.tests.status !== "authorized")
        return { status: "blocked", reasonCode: "activation_tests_blocked" };
    if (input.rollback.status !== "authorized")
        return { status: "blocked", reasonCode: "rollback_evidence_blocked" };
    if (input.rollback.sourceRef !== input.activation.sourceRef
        || input.rollback.targetVersion === input.activation.sourceVersion
        || input.rollback.targetChecksum === input.activation.sourceChecksum
        || !exact(input.rollback.rollbackSourceRef) || !exact(input.rollback.verificationRef)) {
        return { status: "blocked", reasonCode: "rollback_target_invalid" };
    }
    return {
        status: "authorized",
        activationId: input.activation.activationId,
        sourceRef: input.activation.sourceRef,
        sourceVersion: input.activation.sourceVersion,
        loaderId: input.activation.loaderId,
        activatedAt: input.activation.activatedAt,
        method: input.activation.method,
        testIds: input.tests.testIds,
        rollbackSourceRef: input.rollback.rollbackSourceRef,
        evidenceRefs: [...input.activation.evidenceRefs, ...input.tests.evidenceRefs, input.rollback.verificationRef],
    };
}
export async function publishCompletePromptActivation(input) {
    if (input.decision.status !== "authorized")
        return input.decision;
    return { status: "published", result: await input.publish(input.decision) };
}
//# sourceMappingURL=complete-prompt-activation.js.map