import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
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
function hasSameEvidence(receipt, descriptor) {
    return receipt.receiptId === descriptor.receiptId
        && receipt.workId === descriptor.workId
        && receipt.kind === descriptor.kind
        && receipt.evidenceFingerprint === descriptor.evidenceFingerprint
        && receipt.evidenceRefs.length === descriptor.evidenceRefs.length
        && receipt.evidenceRefs.every((ref, index) => ref === descriptor.evidenceRefs[index]);
}
export function recordCanonicalIntakeDiagnosis(descriptor, dependencies) {
    const issuance = dependencies.issueReceipt({
        workId: descriptor.workId,
        receiptId: descriptor.receiptId,
        kind: descriptor.kind,
        evidenceFingerprint: descriptor.evidenceFingerprint,
        evidenceRefs: descriptor.evidenceRefs,
    });
    if (!issuance.issued) {
        const existing = dependencies.loadReceipt(descriptor.receiptId);
        if (!existing || !hasSameEvidence(existing, descriptor)) {
            return { ok: false, reasonCode: issuance.reasonCode };
        }
        if (existing.consumedRevision !== undefined) {
            return existing.consumedRevision === 1
                ? { ok: true }
                : { ok: false, reasonCode: "diagnosis_receipt_consumed_at_invalid_revision" };
        }
    }
    const transition = dependencies.applyDiagnosisTransition({
        runId: descriptor.runId,
        workId: descriptor.workId,
        receiptRef: descriptor.receiptId,
    });
    if (transition.status === "applied")
        return { ok: true };
    return {
        ok: false,
        reasonCode: transition.reasonCode ?? "canonical_diagnosis_transition_rejected",
    };
}
export function buildCanonicalIntakeDiagnosisDescriptor(input) {
    const runId = input.runId.trim();
    if (!runId)
        throw new Error("Run ID is required for canonical intake diagnosis.");
    const digest = createHash("sha256").update(stableStringify(input.intake)).digest("hex");
    return {
        runId,
        workId: canonicalWorkIdForRootRun(runId),
        receiptId: `receipt:intake:${runId}:${digest.slice(0, 24)}`,
        kind: "diagnosis",
        evidenceFingerprint: `sha256:${digest}`,
        evidenceRefs: [`llm-intake-result:${runId}:${digest.slice(0, 24)}`],
    };
}
//# sourceMappingURL=canonical-intake-diagnosis.js.map