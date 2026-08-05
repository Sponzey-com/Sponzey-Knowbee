import { createHash } from "node:crypto";
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
function text(value, maxLength) {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim();
    return normalized && normalized.length <= maxLength ? normalized : null;
}
function exactKeys(value, keys) {
    const actual = Object.keys(value).sort();
    const expected = [...keys].sort();
    return actual.length === expected.length &&
        expected.every((key, index) => key === actual[index]);
}
export function webEvidenceSnapshotFingerprint(units, requiredFactKeys, budgetFingerprint) {
    return sha256(JSON.stringify({
        budgetFingerprint,
        requiredFactKeys,
        units: units.map((unit) => ({
            unitRef: unit.unitRef,
            evidenceRef: unit.evidenceRef,
            chunkRefs: unit.chunkRefs,
            factKey: unit.factKey,
            confidence: unit.confidence,
        })),
    }));
}
export function admitWebEvidenceReview(input) {
    if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" });
    }
    const receipt = input.receipt;
    if (!exactKeys(receipt, [
        "budgetFingerprint",
        "evidenceSnapshotFingerprint",
        "duplicateGroups",
        "conflicts",
        "unresolvedFactKeys",
    ])) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" });
    }
    if (receipt.budgetFingerprint !== input.budgetFingerprint ||
        receipt.evidenceSnapshotFingerprint !== input.evidenceSnapshotFingerprint) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fingerprint_mismatch" });
    }
    if (!Array.isArray(receipt.duplicateGroups) ||
        !Array.isArray(receipt.conflicts) ||
        !Array.isArray(receipt.unresolvedFactKeys)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" });
    }
    const units = new Map(input.units.map((unit) => [unit.unitRef, unit]));
    const allowedFacts = new Set(input.requiredFactKeys);
    const groupedRefs = new Set();
    const duplicateGroups = [];
    for (const rawGroup of receipt.duplicateGroups) {
        if (!Array.isArray(rawGroup) ||
            rawGroup.length < 2 ||
            new Set(rawGroup).size !== rawGroup.length ||
            rawGroup.some((ref) => !text(ref, 128) || !units.has(ref))) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_review_reference_invalid" });
        }
        const group = rawGroup;
        const factKeys = new Set(group.map((ref) => units.get(ref)?.factKey));
        if (factKeys.size !== 1 || group.some((ref) => groupedRefs.has(ref))) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fact_invalid" });
        }
        group.forEach((ref) => groupedRefs.add(ref));
        duplicateGroups.push(Object.freeze([...group]));
    }
    const conflicts = [];
    for (const rawConflict of receipt.conflicts) {
        if (!rawConflict || typeof rawConflict !== "object" || Array.isArray(rawConflict)) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" });
        }
        const conflict = rawConflict;
        if (!exactKeys(conflict, ["factKey", "unitRefs", "reason"])) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" });
        }
        const factKey = text(conflict.factKey, 128);
        const reason = text(conflict.reason, 512);
        if (!factKey ||
            !reason ||
            !allowedFacts.has(factKey) ||
            !Array.isArray(conflict.unitRefs) ||
            conflict.unitRefs.length < 2 ||
            new Set(conflict.unitRefs).size !== conflict.unitRefs.length ||
            conflict.unitRefs.some((ref) => !text(ref, 128) || units.get(ref)?.factKey !== factKey)) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fact_invalid" });
        }
        conflicts.push(Object.freeze({
            factKey,
            unitRefs: Object.freeze([...conflict.unitRefs]),
            reason,
        }));
    }
    const unresolvedFactKeys = receipt.unresolvedFactKeys.map((fact) => text(fact, 128));
    if (unresolvedFactKeys.some((fact) => !fact || !allowedFacts.has(fact)) ||
        new Set(unresolvedFactKeys).size !== unresolvedFactKeys.length) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_review_fact_invalid" });
    }
    return Object.freeze({
        ok: true,
        review: Object.freeze({
            evidenceSnapshotFingerprint: input.evidenceSnapshotFingerprint,
            budgetFingerprint: input.budgetFingerprint,
            duplicateGroups: Object.freeze(duplicateGroups),
            conflicts: Object.freeze(conflicts),
            unresolvedFactKeys: Object.freeze(unresolvedFactKeys),
        }),
    });
}
function provenanceIndex(units) {
    const byEvidence = new Map();
    for (const unit of units) {
        const existing = byEvidence.get(unit.evidenceRef) ?? [];
        existing.push(unit);
        byEvidence.set(unit.evidenceRef, existing);
    }
    return Object.freeze([...byEvidence.values()].map((sourceUnits) => {
        const first = sourceUnits[0];
        return Object.freeze({
            evidenceRef: first.evidenceRef,
            sourceTitle: first.sourceTitle,
            url: first.url,
            publishedAt: first.publishedAt,
            retrievedAt: first.retrievedAt,
            chunkRefs: Object.freeze([...new Set(sourceUnits.flatMap((unit) => unit.chunkRefs))]),
        });
    }));
}
export function assembleWebEvidencePack(input) {
    if (input.estimator.version.trim() !== input.budget.estimatorVersion ||
        input.units.length < 1 ||
        input.units.some((unit) => unit.budgetFingerprint !== input.budget.fingerprint)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_input_invalid" });
    }
    const unitByRef = new Map(input.units.map((unit) => [unit.unitRef, unit]));
    const protectedRefs = new Set(input.review.conflicts.flatMap((conflict) => conflict.unitRefs));
    const droppedRefs = new Set();
    for (const group of input.review.duplicateGroups) {
        const protectedGroupRefs = group.filter((ref) => protectedRefs.has(ref));
        const retainedRef = protectedGroupRefs[0] ?? [...group].sort((left, right) => {
            const confidenceDifference = (unitByRef.get(right)?.confidence ?? 0) - (unitByRef.get(left)?.confidence ?? 0);
            return confidenceDifference || left.localeCompare(right);
        })[0];
        for (const ref of group) {
            if (ref !== retainedRef && !protectedRefs.has(ref))
                droppedRefs.add(ref);
        }
    }
    let retained = input.units.filter((unit) => !droppedRefs.has(unit.unitRef));
    const unresolved = Object.freeze([...new Set([
            ...input.compressionResults.flatMap((result) => result.unresolvedFactKeys),
            ...input.review.unresolvedFactKeys,
        ])]);
    const buildProjection = (units) => ({
        schemaVersion: 1,
        budgetFingerprint: input.budget.fingerprint,
        evidenceSnapshotFingerprint: input.review.evidenceSnapshotFingerprint,
        units,
        conflicts: input.review.conflicts,
        unresolvedFactKeys: unresolved,
        provenanceIndex: provenanceIndex(units),
        droppedUnitRefs: Object.freeze(input.units
            .filter((unit) => !units.some((retainedUnit) => retainedUnit.unitRef === unit.unitRef))
            .map((unit) => unit.unitRef)),
    });
    const estimateProjection = (projection) => {
        try {
            const value = input.estimator.estimateTokens(JSON.stringify(projection));
            return Number.isInteger(value) && value >= 0 ? value : null;
        }
        catch {
            return null;
        }
    };
    let projection = buildProjection(retained);
    let estimatedTokens = estimateProjection(projection);
    if (estimatedTokens === null) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_estimator_invalid" });
    }
    while (estimatedTokens > input.budget.allocations.webEvidenceTokens) {
        const factCounts = new Map();
        retained.forEach((unit) => factCounts.set(unit.factKey, (factCounts.get(unit.factKey) ?? 0) + 1));
        const removable = [...retained]
            .filter((unit) => !protectedRefs.has(unit.unitRef) &&
            ((factCounts.get(unit.factKey) ?? 0) > 1 || unresolved.includes(unit.factKey)))
            .sort((left, right) => left.confidence - right.confidence || right.unitRef.localeCompare(left.unitRef))[0];
        if (!removable) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_budget_exhausted" });
        }
        droppedRefs.add(removable.unitRef);
        retained = retained.filter((unit) => unit.unitRef !== removable.unitRef);
        projection = buildProjection(retained);
        estimatedTokens = estimateProjection(projection);
        if (estimatedTokens === null) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_estimator_invalid" });
        }
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            ...projection,
            units: Object.freeze([...projection.units]),
            totalTokenEstimate: estimatedTokens,
            packFingerprint: sha256(JSON.stringify({ ...projection, totalTokenEstimate: estimatedTokens })),
        }),
    });
}
//# sourceMappingURL=web-evidence-pack.js.map