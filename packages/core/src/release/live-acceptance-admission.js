const SAFE_KEYS = new Set([
    "evidenceRef",
    "capability",
    "scenarioId",
    "terminalStatus",
    "auditEventId",
    "executedAt",
    "redactionStatus",
]);
export function admitLiveAcceptance(input) {
    const reasons = [];
    const accepted = [];
    for (const capability of input.requiredCapabilities) {
        const item = input.evidence.find((candidate) => candidate.capability === capability);
        let reason;
        if (!item)
            reason = "live_evidence_missing";
        else if (Object.keys(item).some((key) => !SAFE_KEYS.has(key))) {
            reason = "live_evidence_unsafe_shape";
        }
        else if (item.terminalStatus !== "passed")
            reason = "live_evidence_not_passed";
        else if (input.now - item.executedAt > input.maxAgeMs || item.executedAt > input.now) {
            reason = "live_evidence_stale";
        }
        else if (item.redactionStatus !== "verified")
            reason = "live_evidence_unredacted";
        else if (!item.auditEventId.trim() || !item.evidenceRef.trim() || !item.scenarioId.trim()) {
            reason = "live_evidence_audit_missing";
        }
        if (reason) {
            if (!reasons.includes(reason))
                reasons.push(reason);
        }
        else if (item) {
            accepted.push(item.evidenceRef);
        }
    }
    if (reasons.length === 0) {
        return { status: "admitted", reasonCodes: [], acceptedEvidenceRefs: accepted };
    }
    return {
        status: input.audience === "public" ? "blocked" : "warning",
        reasonCodes: reasons,
        acceptedEvidenceRefs: accepted,
    };
}
//# sourceMappingURL=live-acceptance-admission.js.map