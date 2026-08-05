import { admitWebEvidenceRecovery, } from "../contracts/web-evidence-recovery.js";
export async function planWebEvidenceRecovery(input, port) {
    if (input.signal.aborted) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_cancelled" });
    }
    const runId = input.runId.trim();
    if (!runId || runId.length > 256) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_input_invalid" });
    }
    let receipt;
    try {
        receipt = await port.proposeRecovery(Object.freeze({
            runId,
            unresolvedFactKeys: input.verification.unresolvedFactKeys,
            packFingerprint: input.verification.packFingerprint,
            attemptedStrategyFingerprints: Object.freeze([
                ...input.attemptedStrategyFingerprints,
            ]),
            allowedMethods: Object.freeze(["search", "fetch"]),
            blockedAllowed: input.blockedAllowed,
        }));
    }
    catch {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_receipt_invalid" });
    }
    if (input.signal.aborted) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_recovery_cancelled" });
    }
    return admitWebEvidenceRecovery({
        receipt,
        verification: input.verification,
        attemptedStrategyFingerprints: input.attemptedStrategyFingerprints,
        blockedAllowed: input.blockedAllowed,
    });
}
//# sourceMappingURL=web-evidence-recovery.js.map