const SHA256 = /^sha256:[a-f0-9]{64}$/u;
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
function publicUrl(value) {
    const normalized = text(value, 8_192);
    if (!normalized)
        return null;
    try {
        const url = new URL(normalized);
        return ((url.protocol === "http:" || url.protocol === "https:") &&
            !url.username &&
            !url.password &&
            url.hostname) ? url.toString() : null;
    }
    catch {
        return null;
    }
}
export function admitWebEvidenceRecovery(input) {
    if (input.verification.status === "sufficient" ||
        input.verification.unresolvedFactKeys.length < 1 ||
        input.attemptedStrategyFingerprints.some((fingerprint) => !SHA256.test(fingerprint)) ||
        new Set(input.attemptedStrategyFingerprints).size !==
            input.attemptedStrategyFingerprints.length) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_input_invalid" });
    }
    if (!input.receipt || typeof input.receipt !== "object" || Array.isArray(input.receipt)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" });
    }
    const receipt = input.receipt;
    if (!exactKeys(receipt, ["packFingerprint", "action", "candidates"])) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" });
    }
    if (receipt.packFingerprint !== input.verification.packFingerprint) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_pack_mismatch" });
    }
    if (!Array.isArray(receipt.candidates) || receipt.candidates.length > 16) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" });
    }
    if (receipt.action === "blocked") {
        if (!input.blockedAllowed || receipt.candidates.length > 0) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_blocked_not_admitted" });
        }
        return Object.freeze({
            ok: true,
            value: Object.freeze({
                action: "blocked",
                packFingerprint: input.verification.packFingerprint,
                candidates: Object.freeze([]),
            }),
        });
    }
    if (receipt.action !== "continue" || receipt.candidates.length < 1) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" });
    }
    const unresolvedFacts = new Set(input.verification.unresolvedFactKeys);
    const attempted = new Set(input.attemptedStrategyFingerprints);
    const candidateIds = new Set();
    const proposedFingerprints = new Set();
    const candidates = [];
    for (const rawCandidate of receipt.candidates) {
        if (!rawCandidate || typeof rawCandidate !== "object" || Array.isArray(rawCandidate)) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
        }
        const candidate = rawCandidate;
        const candidateId = text(candidate.candidateId, 256);
        const factKey = text(candidate.factKey, 128);
        const strategyFingerprint = text(candidate.strategyFingerprint, 80);
        if (!candidateId ||
            !factKey ||
            !unresolvedFacts.has(factKey) ||
            !strategyFingerprint ||
            !SHA256.test(strategyFingerprint) ||
            candidateIds.has(candidateId)) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
        }
        if (attempted.has(strategyFingerprint) ||
            proposedFingerprints.has(strategyFingerprint)) {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_strategy_unchanged" });
        }
        let normalized;
        if (candidate.kind === "search") {
            if (!exactKeys(candidate, [
                "candidateId",
                "factKey",
                "kind",
                "query",
                "strategyFingerprint",
            ])) {
                return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
            }
            const query = text(candidate.query, 512);
            if (!query) {
                return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
            }
            normalized = Object.freeze({
                candidateId,
                factKey,
                kind: "search",
                query,
                strategyFingerprint: strategyFingerprint,
            });
        }
        else if (candidate.kind === "fetch") {
            if (!exactKeys(candidate, [
                "candidateId",
                "factKey",
                "kind",
                "sourceUrl",
                "evidenceRef",
                "strategyFingerprint",
            ])) {
                return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
            }
            const sourceUrl = publicUrl(candidate.sourceUrl);
            const evidenceRef = text(candidate.evidenceRef, 256);
            if (!sourceUrl || !evidenceRef) {
                return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
            }
            normalized = Object.freeze({
                candidateId,
                factKey,
                kind: "fetch",
                sourceUrl,
                evidenceRef,
                strategyFingerprint: strategyFingerprint,
            });
        }
        else {
            return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_candidate_invalid" });
        }
        candidateIds.add(candidateId);
        proposedFingerprints.add(strategyFingerprint);
        candidates.push(normalized);
    }
    return Object.freeze({
        ok: true,
        value: Object.freeze({
            action: "continue",
            packFingerprint: input.verification.packFingerprint,
            candidates: Object.freeze(candidates),
        }),
    });
}
//# sourceMappingURL=web-evidence-recovery.js.map