import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
function normalized(value) {
    return value.trim();
}
function stableStringify(value) {
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value)
            .filter(([, nested]) => nested !== undefined)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
export function buildSolutionPlanCapabilityAdmission(input) {
    const runId = normalized(input.runId);
    const solutionPlanReceiptId = normalized(input.solutionPlanReceiptId);
    const policyReceiptId = normalized(input.policyReceiptId);
    const targetId = normalized(input.targetId ?? "");
    if (!runId ||
        !solutionPlanReceiptId ||
        !policyReceiptId ||
        !normalized(input.capabilitySnapshot.snapshotId) ||
        !SHA256_PATTERN.test(input.capabilitySnapshot.fingerprint) ||
        input.selections.length === 0) {
        return { ok: false, reasonCode: "capability_admission_invalid" };
    }
    const stepIds = new Set();
    const approved = new Set(input.approvedCapabilityIds.map(normalized).filter(Boolean));
    const approvalRequiredCapabilityIds = new Set();
    const entries = [];
    for (const selection of input.selections) {
        const stepId = normalized(selection.stepId);
        const capabilityRef = normalized(selection.capabilityRef);
        const capabilityId = capabilityRef.startsWith("capability:")
            ? normalized(capabilityRef.slice("capability:".length))
            : "";
        if (!stepId || stepIds.has(stepId) || !capabilityId) {
            return { ok: false, reasonCode: "capability_admission_invalid" };
        }
        stepIds.add(stepId);
        const candidates = input.capabilitySnapshot.bindings.filter((binding) => normalized(binding.capabilityId) === capabilityId);
        if (candidates.length === 0) {
            return { ok: false, reasonCode: "capability_admission_outside_snapshot" };
        }
        const targetCandidates = targetId
            ? candidates.filter((binding) => normalized(binding.targetId) === targetId)
            : candidates;
        if (targetCandidates.length === 0) {
            return { ok: false, reasonCode: "capability_admission_target_unavailable" };
        }
        if (targetCandidates.length !== 1) {
            return { ok: false, reasonCode: "capability_admission_target_ambiguous" };
        }
        const binding = targetCandidates[0];
        if (!binding)
            return { ok: false, reasonCode: "capability_admission_invalid" };
        if (binding.risk === "denied") {
            return { ok: false, reasonCode: "capability_admission_denied" };
        }
        if (binding.risk === "approval_required" && !approved.has(capabilityId)) {
            approvalRequiredCapabilityIds.add(capabilityId);
        }
        entries.push({
            stepId,
            capabilityRef,
            capabilityId,
            targetId: normalized(binding.targetId),
        });
    }
    const approvalRequired = [...approvalRequiredCapabilityIds].sort();
    const outcome = approvalRequired.length > 0
        ? "approval_required"
        : "allowed";
    const evidence = {
        runId,
        solutionPlanReceiptId,
        policyReceiptId,
        snapshotId: normalized(input.capabilitySnapshot.snapshotId),
        snapshotFingerprint: input.capabilitySnapshot.fingerprint,
        outcome,
        approvalRequiredCapabilityIds: approvalRequired,
        entries,
    };
    const digest = createHash("sha256").update(stableStringify(evidence)).digest("hex");
    return {
        ok: true,
        descriptor: {
            runId,
            receiptId: `receipt:capability-admission:${runId}:${digest.slice(0, 24)}`,
            solutionPlanReceiptId,
            policyReceiptId,
            capabilitySnapshotFingerprint: input.capabilitySnapshot.fingerprint,
            outcome,
            approvalRequiredCapabilityIds: approvalRequired,
            entries,
            evidenceFingerprint: `sha256:${digest}`,
            evidenceRefs: [
                `solution-plan-receipt:${solutionPlanReceiptId}`,
                `policy-receipt:${policyReceiptId}`,
                `capability-snapshot-fingerprint:${input.capabilitySnapshot.fingerprint}`,
                ...entries.map((entry) => {
                    const stepDigest = createHash("sha256")
                        .update(`${entry.stepId}\u0000${entry.capabilityRef}`)
                        .digest("hex");
                    return `capability-step:${stepDigest.slice(0, 24)}`;
                }),
            ],
        },
    };
}
export function recordSolutionPlanCapabilityAdmission(descriptor, dependencies) {
    const receipt = {
        receiptId: descriptor.receiptId,
        workId: canonicalWorkIdForRootRun(descriptor.runId),
        kind: "policy",
        evidenceFingerprint: descriptor.evidenceFingerprint,
        evidenceRefs: descriptor.evidenceRefs,
    };
    const issued = dependencies.issueReceipt(receipt);
    if (!issued.issued) {
        const existing = dependencies.loadReceipt(receipt.receiptId);
        const exact = existing?.workId === receipt.workId &&
            existing.kind === receipt.kind &&
            existing.evidenceFingerprint === receipt.evidenceFingerprint &&
            existing.evidenceRefs.length === receipt.evidenceRefs.length &&
            existing.evidenceRefs.every((reference, index) => reference === receipt.evidenceRefs[index]);
        if (!exact)
            return { ok: false, reasonCode: issued.reasonCode };
    }
    return {
        ok: true,
        capabilityAdmissionReceiptId: descriptor.receiptId,
    };
}
//# sourceMappingURL=solution-plan-capability-admission.js.map