import { createHash } from "node:crypto";
function normalized(value) {
    return value.trim();
}
function isValidBinding(binding) {
    return [
        binding.parentRunId,
        binding.parentAgentId,
        binding.childAgentId,
        binding.childAgentNameSnapshot,
        binding.subSessionId,
        binding.resultReportId,
    ].every((value) => normalized(value).length > 0) &&
        /^sha256:[a-f0-9]{64}$/u.test(binding.resultFingerprint);
}
function bindingFingerprint(binding) {
    const digest = createHash("sha256").update(JSON.stringify({
        parentRunId: normalized(binding.parentRunId),
        parentAgentId: normalized(binding.parentAgentId),
        childAgentId: normalized(binding.childAgentId),
        childAgentNameFingerprint: createHash("sha256")
            .update(normalized(binding.childAgentNameSnapshot))
            .digest("hex"),
        subSessionId: normalized(binding.subSessionId),
        resultReportId: normalized(binding.resultReportId),
        resultFingerprint: binding.resultFingerprint,
    })).digest("hex");
    return `sha256:${digest}`;
}
export function issueChildResultTrustReceipt(input) {
    if (!isValidBinding(input)) {
        return { ok: false, reasonCode: "child_result_binding_invalid" };
    }
    const directChildren = new Set(input.directChildAgentIds.map(normalized).filter(Boolean));
    if (!directChildren.has(normalized(input.childAgentId))) {
        return { ok: false, reasonCode: "child_result_not_direct_child" };
    }
    const fingerprint = bindingFingerprint(input);
    return {
        ok: true,
        receipt: Object.freeze({
            schemaVersion: "child-result-trust-v1",
            parentRunId: normalized(input.parentRunId),
            parentAgentId: normalized(input.parentAgentId),
            childAgentId: normalized(input.childAgentId),
            subSessionId: normalized(input.subSessionId),
            resultReportId: normalized(input.resultReportId),
            resultFingerprint: input.resultFingerprint,
            bindingFingerprint: fingerprint,
            sourceRef: `child-result:${fingerprint.slice("sha256:".length)}`,
            trustClass: "untrusted_external",
            instructionIsolation: "data_only",
            redactionState: "redacted",
        }),
    };
}
export function validateChildResultTrustReceipt(input) {
    const sourceRef = input.receipt.sourceRef;
    if (input.receipt.trustClass !== "untrusted_external" ||
        input.receipt.instructionIsolation !== "data_only" ||
        input.receipt.redactionState !== "redacted") {
        return { allowed: false, reasonCode: "child_result_receipt_isolation_invalid", sourceRef };
    }
    const issued = issueChildResultTrustReceipt({
        ...input.expected,
        directChildAgentIds: input.directChildAgentIds,
    });
    if (!issued.ok)
        return { allowed: false, reasonCode: issued.reasonCode, sourceRef };
    if (issued.receipt.bindingFingerprint !== input.receipt.bindingFingerprint ||
        issued.receipt.sourceRef !== sourceRef) {
        return { allowed: false, reasonCode: "child_result_receipt_binding_mismatch", sourceRef };
    }
    return { allowed: true, reasonCode: "child_result_data_only", sourceRef };
}
export function projectChildResultForParent(input) {
    return Object.freeze({
        role: "external_data",
        policyAuthority: "none",
        sourceRef: input.receipt.sourceRef,
        instructionIsolation: "data_only",
        content: input.content.trim(),
    });
}
//# sourceMappingURL=child-result-trust.js.map