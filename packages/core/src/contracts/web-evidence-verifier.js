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
export function admitWebEvidenceVerification(input) {
    if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" });
    }
    const receipt = input.receipt;
    if (!exactKeys(receipt, [
        "packFingerprint",
        "budgetFingerprint",
        "status",
        "answerDraft",
        "supportedUnitRefs",
        "unresolvedFactKeys",
    ])) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" });
    }
    if (receipt.packFingerprint !== input.evidencePack.packFingerprint ||
        receipt.budgetFingerprint !== input.evidencePack.budgetFingerprint) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fingerprint_mismatch" });
    }
    if (receipt.status !== "sufficient" &&
        receipt.status !== "insufficient" &&
        receipt.status !== "conflicted") {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" });
    }
    if (!Array.isArray(receipt.supportedUnitRefs) ||
        !Array.isArray(receipt.unresolvedFactKeys) ||
        new Set(receipt.supportedUnitRefs).size !== receipt.supportedUnitRefs.length ||
        new Set(receipt.unresolvedFactKeys).size !== receipt.unresolvedFactKeys.length) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" });
    }
    const units = new Map(input.evidencePack.units.map((unit) => [unit.unitRef, unit]));
    if (receipt.supportedUnitRefs.some((ref) => !text(ref, 128) || !units.has(ref))) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_reference_invalid" });
    }
    const allowedFacts = new Set(input.requiredFactKeys);
    if (receipt.unresolvedFactKeys.some((fact) => !text(fact, 128) || !allowedFacts.has(fact))) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fact_invalid" });
    }
    const supportedFacts = new Set(receipt.supportedUnitRefs.map((ref) => units.get(ref)?.factKey));
    if (receipt.unresolvedFactKeys.some((fact) => supportedFacts.has(fact))) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fact_invalid" });
    }
    if (input.evidencePack.unresolvedFactKeys.some((fact) => !receipt.unresolvedFactKeys.includes(fact))) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_fact_invalid" });
    }
    const answerDraft = receipt.answerDraft === null
        ? null
        : text(receipt.answerDraft, 8_000);
    if (receipt.answerDraft !== null && !answerDraft) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_receipt_invalid" });
    }
    if (receipt.status === "sufficient") {
        if (!answerDraft ||
            receipt.unresolvedFactKeys.length > 0 ||
            input.evidencePack.conflicts.length > 0 ||
            input.requiredFactKeys.some((fact) => !supportedFacts.has(fact))) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" });
        }
    }
    if (receipt.status === "insufficient" && receipt.unresolvedFactKeys.length < 1) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" });
    }
    if (receipt.status === "conflicted") {
        const conflictFacts = new Set(input.evidencePack.conflicts.map((conflict) => conflict.factKey));
        if (conflictFacts.size < 1 ||
            [...conflictFacts].some((fact) => !receipt.unresolvedFactKeys.includes(fact))) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_verification_status_invalid" });
        }
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            packFingerprint: input.evidencePack.packFingerprint,
            budgetFingerprint: input.evidencePack.budgetFingerprint,
            status: receipt.status,
            answerDraft,
            supportedUnitRefs: Object.freeze([...receipt.supportedUnitRefs]),
            unresolvedFactKeys: Object.freeze([...receipt.unresolvedFactKeys]),
        }),
    });
}
//# sourceMappingURL=web-evidence-verifier.js.map