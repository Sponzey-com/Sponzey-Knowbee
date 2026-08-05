export function projectObligationChecksum(obligation) {
    const normalized = obligation.replace(/\s+/gu, " ").trim();
    let hash = 0x811c9dc5;
    for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
export function buildExactEvidenceMigrationReport(input) {
    const evidenced = new Set(input.historicalEvidenceRequirementIds);
    const historicalByText = new Map(input.historicalClauses.map((clause) => [clause.text, `REQ-${clause.clauseId}`]));
    const candidates = [];
    const unmatched = [];
    for (const clause of input.projectClauses) {
        const projectRequirementId = `PRJ-${clause.clauseId}`;
        const historicalRequirementId = historicalByText.get(clause.text);
        if (historicalRequirementId && evidenced.has(historicalRequirementId)) {
            candidates.push({ projectRequirementId, historicalRequirementId });
        }
        else {
            unmatched.push({ requirementId: projectRequirementId, section: clause.section });
        }
    }
    candidates.sort((left, right) => left.projectRequirementId.localeCompare(right.projectRequirementId));
    unmatched.sort((left, right) => left.section.localeCompare(right.section, undefined, { numeric: true }) ||
        left.requirementId.localeCompare(right.requirementId));
    const bySection = new Map();
    for (const item of unmatched) {
        bySection.set(item.section, [...(bySection.get(item.section) ?? []), item.requirementId]);
    }
    const sections = [...bySection].map(([section, requirementIds]) => ({
        section,
        count: requirementIds.length,
        requirementIds,
    }));
    return { candidates, unmatched, sections };
}
export function auditProjectEvidenceClaims(input) {
    const diagnostics = [];
    for (const requirement of input.requirements) {
        const entry = input.entries[requirement.requirementId];
        if (!entry)
            continue;
        const checksum = projectObligationChecksum(requirement.obligation);
        if (entry.obligationChecksum !== checksum) {
            diagnostics.push({
                code: "obligation_checksum_mismatch",
                requirementId: requirement.requirementId,
                evidenceIndex: null,
            });
        }
        for (const [evidenceIndex, evidence] of (entry.evidence ?? []).entries()) {
            if (!evidence.claimRefs?.includes(`obligation:${checksum}`)) {
                diagnostics.push({
                    code: "evidence_claim_unbound",
                    requirementId: requirement.requirementId,
                    evidenceIndex,
                });
            }
        }
    }
    diagnostics.sort((left, right) => left.code.localeCompare(right.code) ||
        left.requirementId.localeCompare(right.requirementId) ||
        (left.evidenceIndex ?? -1) - (right.evidenceIndex ?? -1));
    return { complete: diagnostics.length === 0, diagnostics };
}
//# sourceMappingURL=project-evidence-integrity.js.map