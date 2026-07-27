import { createHash } from "node:crypto";
function sha256(value) {
    return createHash("sha256").update(value.trim()).digest("hex");
}
export function buildCanonicalPendingResponseReviewEnvelope(review, terminalReportFingerprint) {
    return {
        schemaVersion: 1,
        rawTextSha256: sha256(review.rawText),
        ...(terminalReportFingerprint ? { terminalReportFingerprint } : {}),
        rawTextSource: review.rawTextSource,
        contentKind: review.contentKind,
        expectedLanguage: review.expectedLanguage,
        receipt: { ...review.receipt },
    };
}
//# sourceMappingURL=canonical-pending-response-review.js.map