import { createHash } from "node:crypto";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function normalized(value) {
    return value.trim();
}
function uniqueNormalized(values) {
    return [...new Set(values.map(normalized).filter(Boolean))];
}
function stableStringify(value) {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, nested]) => nested !== undefined)
            .sort(([left], [right]) => left.localeCompare(right));
        return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
function decision(input, outcome, reasonCode, capabilityIds) {
    return {
        outcome,
        reasonCode,
        evaluatedCapabilityIds: uniqueNormalized(capabilityIds),
        capabilitySnapshotId: input.capabilitySnapshot.snapshotId,
    };
}
function structurallyValid(input) {
    if (!normalized(input.runId) || !normalized(input.workId))
        return false;
    if (!normalized(input.capabilitySnapshot.snapshotId))
        return false;
    if (!SHA256_PATTERN.test(input.planFingerprint))
        return false;
    if (!SHA256_PATTERN.test(input.capabilitySnapshot.fingerprint))
        return false;
    const bindingsValid = input.capabilitySnapshot.bindings.every((binding) => Boolean(normalized(binding.capabilityId)) && Boolean(normalized(binding.targetId)));
    const exclusionsValid = (input.capabilitySnapshot.exclusions ?? []).every((exclusion) => Boolean(normalized(exclusion.capabilityId)) &&
        Boolean(normalized(exclusion.targetId)) &&
        uniqueNormalized(exclusion.reasonCodes).length > 0);
    return bindingsValid && exclusionsValid;
}
export function evaluateCanonicalPlanPolicy(input) {
    if (!structurallyValid(input))
        return decision(input, "denied", "invalid_policy_input", []);
    const requested = uniqueNormalized(input.constraints.requestedMethods);
    const required = uniqueNormalized(input.constraints.requiredMethods);
    const exclusive = uniqueNormalized(input.constraints.exclusiveMethods);
    const selected = uniqueNormalized([
        ...(exclusive.length > 0 ? exclusive : requested),
        ...required,
    ]);
    const availableIds = new Set(input.capabilitySnapshot.bindings.map((binding) => normalized(binding.capabilityId)));
    const unavailableExclusive = exclusive.filter((capabilityId) => !availableIds.has(capabilityId));
    if (unavailableExclusive.length > 0) {
        return decision(input, "input_required", "exclusive_method_unavailable", unavailableExclusive);
    }
    const unavailableRequired = required.filter((capabilityId) => !availableIds.has(capabilityId));
    if (unavailableRequired.length > 0) {
        return decision(input, "denied", "required_method_unavailable", unavailableRequired);
    }
    const targetId = normalized(input.constraints.targetId ?? "");
    const targetScopedMethods = uniqueNormalized([...exclusive, ...requested]);
    const selectedBindings = input.capabilitySnapshot.bindings.filter((binding) => selected.includes(normalized(binding.capabilityId)));
    if (targetId &&
        targetScopedMethods
            .filter((capabilityId) => availableIds.has(capabilityId))
            .some((capabilityId) => !selectedBindings.some((binding) => normalized(binding.capabilityId) === capabilityId &&
            normalized(binding.targetId) === targetId))) {
        return decision(input, "input_required", "target_binding_unavailable", targetScopedMethods);
    }
    const applicableBindings = targetId
        ? selectedBindings.filter((binding) => normalized(binding.targetId) === targetId)
        : selectedBindings;
    if (applicableBindings.some((binding) => binding.risk === "denied")) {
        return decision(input, "denied", "capability_denied", selected);
    }
    return decision(input, "allowed", "plan_bindings_allowed", selected);
}
export function buildCanonicalPlanPolicyReceiptDescriptor(input) {
    if (input.decision.outcome !== "allowed") {
        throw new Error("An allowed policy decision is required to build a canonical policy receipt.");
    }
    const digest = createHash("sha256")
        .update(stableStringify({
        runId: input.input.runId,
        workId: input.input.workId,
        planFingerprint: input.input.planFingerprint,
        capabilitySnapshotId: input.input.capabilitySnapshot.snapshotId,
        capabilitySnapshotFingerprint: input.input.capabilitySnapshot.fingerprint,
        constraints: {
            requiredMethods: uniqueNormalized(input.input.constraints.requiredMethods),
            requestedMethods: uniqueNormalized(input.input.constraints.requestedMethods),
            exclusiveMethods: uniqueNormalized(input.input.constraints.exclusiveMethods),
            targetId: normalized(input.input.constraints.targetId ?? "") || null,
            approvedCapabilityIds: uniqueNormalized(input.input.constraints.approvedCapabilityIds),
        },
        decision: input.decision,
    }))
        .digest("hex");
    return {
        runId: normalized(input.input.runId),
        workId: normalized(input.input.workId),
        receiptId: `receipt:policy:${normalized(input.input.runId)}:${digest.slice(0, 24)}`,
        kind: "policy",
        evidenceFingerprint: `sha256:${digest}`,
        evidenceRefs: [`plan-policy-decision:${normalized(input.input.runId)}:${digest.slice(0, 24)}`],
    };
}
//# sourceMappingURL=canonical-plan-policy.js.map