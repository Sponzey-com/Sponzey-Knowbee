import { buildCanonicalAnalysisRevisionDescriptor, } from "./canonical-analysis-revision.js";
export function recordCanonicalIntakeAnalysis(descriptor, dependencies) {
    const aggregate = dependencies.loadAggregate(descriptor.workId);
    if (!aggregate) {
        return { ok: false, reasonCode: "canonical_transition_aggregate_not_found" };
    }
    if (aggregate.state === "REQUEST_RECEIVED") {
        return dependencies.recordDiagnosis(descriptor);
    }
    if (aggregate.state !== "SOLUTION_ANALYZED") {
        return { ok: false, reasonCode: "canonical_transition_state_mismatch" };
    }
    const previousReceipt = dependencies.findLatestConsumedReceipt("analysis_revision") ??
        dependencies.findLatestConsumedReceipt("diagnosis");
    if (!previousReceipt) {
        return { ok: false, reasonCode: "analysis_revision_previous_receipt_not_found" };
    }
    const built = buildCanonicalAnalysisRevisionDescriptor({
        runId: descriptor.runId,
        previousAnalysisFingerprint: previousReceipt.evidenceFingerprint,
        revisedAnalysisFingerprint: descriptor.evidenceFingerprint,
        safeEvidenceRefs: descriptor.evidenceRefs,
    });
    if (!built.ok)
        return built;
    return dependencies.recordRevision(built.descriptor, aggregate.revision);
}
//# sourceMappingURL=canonical-intake-analysis.js.map