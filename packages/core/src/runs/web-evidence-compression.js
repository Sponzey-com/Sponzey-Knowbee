import { admitWebEvidenceCompression, validateWebEvidenceCompressionContext, } from "../contracts/web-evidence-compression.js";
export async function compressWebResearchEvidence(input, port) {
    const requestGoal = input.requestGoal.trim();
    const context = Object.freeze({
        source: input.source,
        selectedChunks: Object.freeze([...input.selectedChunks]),
        requiredFactKeys: Object.freeze(input.requiredFactKeys.map((key) => key.trim())),
    });
    if (!requestGoal || requestGoal.length > 2_048 || !validateWebEvidenceCompressionContext(context)) {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_context_invalid" });
    }
    let receipt;
    try {
        receipt = await port.compressEvidence(Object.freeze({
            requestGoal,
            requiredFactKeys: context.requiredFactKeys,
            source: context.source,
            selectedChunks: context.selectedChunks,
        }));
    }
    catch {
        return Object.freeze({ ok: false, reasonCode: "web_evidence_compression_receipt_invalid" });
    }
    return admitWebEvidenceCompression(receipt, context);
}
//# sourceMappingURL=web-evidence-compression.js.map