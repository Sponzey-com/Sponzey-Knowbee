import { admitWebEvidenceReview, assembleWebEvidencePack, webEvidenceSnapshotFingerprint, } from "../contracts/web-evidence-pack.js";
export async function reviewAndAssembleWebEvidencePack(input, dependencies) {
    const requestGoal = input.requestGoal.trim();
    const requiredFactKeys = Object.freeze(input.requiredFactKeys.map((fact) => fact.trim()));
    const units = Object.freeze(input.compressionResults.flatMap((result) => result.units));
    if (!requestGoal ||
        requestGoal.length > 2_048 ||
        requiredFactKeys.length < 1 ||
        new Set(requiredFactKeys).size !== requiredFactKeys.length ||
        units.length < 1 ||
        input.compressionResults.some((result) => result.budgetFingerprint !== input.budget.fingerprint)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_pack_input_invalid" });
    }
    const evidenceSnapshotFingerprint = webEvidenceSnapshotFingerprint(units, requiredFactKeys, input.budget.fingerprint);
    let receipt;
    try {
        receipt = await dependencies.reviewPort.reviewEvidence(Object.freeze({
            requestGoal,
            requiredFactKeys,
            budgetFingerprint: input.budget.fingerprint,
            evidenceSnapshotFingerprint,
            units,
        }));
    }
    catch {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_review_receipt_invalid" });
    }
    const admitted = admitWebEvidenceReview({
        receipt,
        units,
        requiredFactKeys,
        budgetFingerprint: input.budget.fingerprint,
        evidenceSnapshotFingerprint,
    });
    if (!admitted.ok || !("review" in admitted))
        return admitted;
    return assembleWebEvidencePack({
        budget: input.budget,
        units,
        compressionResults: input.compressionResults,
        review: admitted.review,
        estimator: dependencies.estimator,
    });
}
//# sourceMappingURL=web-evidence-pack.js.map