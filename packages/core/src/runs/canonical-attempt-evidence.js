import { createHash } from "node:crypto";
import { canonicalWorkIdForRootRun } from "../contracts/canonical-work-aggregate.js";
export function buildCanonicalAttemptEvidenceDescriptor(input) {
    const runId = input.runId.trim();
    if (!runId)
        throw new Error("Run ID is required for canonical attempt evidence.");
    const previewDigest = createHash("sha256").update(input.attempt.preview).digest("hex");
    const evidence = {
        failed: input.attempt.failed,
        previewFingerprint: `sha256:${previewDigest}`,
        aiRecovery: Boolean(input.attempt.aiRecovery),
        workerRuntimeRecovery: Boolean(input.attempt.workerRuntimeRecovery),
        executionRecovery: Boolean(input.attempt.executionRecovery),
        sawRealFilesystemMutation: input.attempt.sawRealFilesystemMutation,
        commandFailureSeen: input.attempt.commandFailureSeen,
        commandRecoveredWithinSamePass: input.attempt.commandRecoveredWithinSamePass,
        successfulToolNames: [
            ...new Set(input.successfulToolNames.map((name) => name.trim()).filter(Boolean)),
        ].sort(),
    };
    const digest = createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
    return {
        runId,
        workId: canonicalWorkIdForRootRun(runId),
        receiptId: `receipt:attempt:${runId}:${digest.slice(0, 24)}`,
        kind: "attempt",
        evidenceFingerprint: `sha256:${digest}`,
        evidenceRefs: [
            `attempt-preview:${runId}:${previewDigest.slice(0, 24)}`,
            ...evidence.successfulToolNames.map((name) => `tool-receipt:${name}`),
        ],
    };
}
export function buildCanonicalRecoveredAttemptEvidenceDescriptor(input) {
    const runId = input.runId.trim();
    const toolName = input.toolName.trim();
    if (!runId || !toolName || !input.continuationId.trim()) {
        throw new Error("Recovered attempt identity is required.");
    }
    const previewDigest = createHash("sha256")
        .update(input.persistedToolResultContent)
        .digest("hex");
    const evidence = {
        source: "approved_operation_continuation",
        continuationId: input.continuationId,
        toolName,
        operationId: input.operationId,
        operationBindingHash: input.operationBindingHash,
        previewFingerprint: `sha256:${previewDigest}`,
    };
    const digest = createHash("sha256")
        .update(JSON.stringify(evidence))
        .digest("hex");
    return {
        runId,
        workId: canonicalWorkIdForRootRun(runId),
        receiptId: `receipt:attempt:${runId}:${digest.slice(0, 24)}`,
        kind: "attempt",
        evidenceFingerprint: `sha256:${digest}`,
        evidenceRefs: [
            `attempt-preview:${runId}:${previewDigest.slice(0, 24)}`,
            `side-effect-operation:${input.operationId}`,
            ...new Set(input.evidenceRefs ?? []),
        ],
    };
}
export function recordCanonicalAttemptEvidence(descriptor, dependencies) {
    const issued = dependencies.issueReceipt({
        receiptId: descriptor.receiptId,
        workId: descriptor.workId,
        kind: descriptor.kind,
        evidenceFingerprint: descriptor.evidenceFingerprint,
        evidenceRefs: descriptor.evidenceRefs,
    });
    if (!issued.issued) {
        const existing = dependencies.loadReceipt(descriptor.receiptId);
        const exact = existing &&
            existing.workId === descriptor.workId &&
            existing.kind === descriptor.kind &&
            existing.evidenceFingerprint === descriptor.evidenceFingerprint &&
            existing.evidenceRefs.length === descriptor.evidenceRefs.length &&
            existing.evidenceRefs.every((ref, index) => ref === descriptor.evidenceRefs[index]);
        if (!exact)
            return { ok: false, reasonCode: issued.reasonCode };
        if (existing.consumedRevision !== undefined)
            return { ok: true };
    }
    const transition = dependencies.applyAttemptTransition({
        runId: descriptor.runId,
        workId: descriptor.workId,
        receiptRef: descriptor.receiptId,
    });
    return transition.status === "applied"
        ? { ok: true }
        : { ok: false, reasonCode: transition.reasonCode ?? "canonical_attempt_transition_rejected" };
}
//# sourceMappingURL=canonical-attempt-evidence.js.map