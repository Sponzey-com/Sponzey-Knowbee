import { projectCapabilitySelectionSnapshot, } from "./capability-selection-snapshot.js";
import { executeCapabilitySelection } from "./capability-selection-use-case.js";
function hasExplicitMethodConstraint(constraints) {
    return Boolean(constraints.requestedMethods.some((method) => method.trim()) ||
        constraints.exclusiveMethods.some((method) => method.trim()));
}
export async function authorizeCanonicalCapabilitySelection(input) {
    if (hasExplicitMethodConstraint(input.methodConstraints)) {
        return { ok: true, mode: "explicit_method" };
    }
    if (input.setupFailureReasonCode) {
        return {
            ok: false,
            reasonCode: input.setupFailureReasonCode,
        };
    }
    if (!input.provider) {
        return {
            ok: false,
            reasonCode: "capability_selection_provider_unavailable",
        };
    }
    let capabilitySnapshot;
    try {
        capabilitySnapshot = projectCapabilitySelectionSnapshot({
            snapshotId: `selection:${input.canonicalSnapshot.snapshotId}`,
            ownerAgentId: input.ownerAgentId,
            canonicalSnapshot: input.canonicalSnapshot,
            skillDefinitions: input.skillDefinitions,
            skillBindings: input.skillBindings,
            instructionSkills: input.instructionSkills,
            instructionSkillFindings: input.instructionSkillFindings,
        });
    }
    catch {
        return {
            ok: false,
            reasonCode: "capability_selection_snapshot_invalid",
        };
    }
    const admission = await executeCapabilitySelection({
        runId: input.runId,
        receiptId: `receipt:capability-selection:${input.runId}`,
        capabilitySnapshot,
        selectionContext: input.selectionContext,
        provider: input.provider,
        ...(input.provider.repairCapabilitySelection
            ? { repairProvider: input.provider }
            : {}),
        ...(input.traceSink ? { traceSink: input.traceSink } : {}),
        userMethodSpecified: false,
        externalTransferAllowed: input.externalTransferAllowed,
        maxCost: input.maxCost,
    });
    if (admission.status === "allowed" || admission.status === "approval_required") {
        const selectedCandidateContext = capabilitySnapshot.candidateContexts?.find((candidate) => candidate.capabilityId === admission.selectedBinding.capabilityId &&
            candidate.targetId === admission.selectedBinding.targetId) ?? null;
        const admittedSelection = {
            status: admission.status,
            receiptId: admission.receiptId,
            selectedBinding: admission.selectedBinding,
        };
        return {
            ok: true,
            mode: "selected",
            capabilitySnapshotFingerprint: capabilitySnapshot.fingerprint,
            admission: admittedSelection,
            selectedCandidateContext,
            ...(admission.decisionTraceId
                ? { decisionTraceId: admission.decisionTraceId }
                : {}),
        };
    }
    if (admission.status === "failed" || admission.status === "cancelled") {
        return {
            ok: false,
            reasonCode: admission.reasonCode,
            ...("validationReasonCodes" in admission && admission.validationReasonCodes
                ? { failureReasonCodes: [...admission.validationReasonCodes] }
                : {}),
            ...(admission.decisionTraceId
                ? { decisionTraceId: admission.decisionTraceId }
                : {}),
        };
    }
    return {
        ok: false,
        reasonCode: "capability_selection_rejected",
        rejectionReasonCodes: "reasonCodes" in admission ? admission.reasonCodes : [],
        ...(admission.decisionTraceId
            ? { decisionTraceId: admission.decisionTraceId }
            : {}),
        ...(admission.strategyFingerprints
            ? { strategyFingerprints: [...admission.strategyFingerprints] }
            : {}),
    };
}
//# sourceMappingURL=canonical-capability-selection.js.map