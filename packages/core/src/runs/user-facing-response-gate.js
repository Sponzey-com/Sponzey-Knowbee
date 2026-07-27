import { createHash } from "node:crypto";
import { detectPrimaryMessageLanguage } from "../channels/language.js";
function sha256(value) {
    return createHash("sha256").update(value.trim()).digest("hex");
}
function authorizeFingerprints(input) {
    const receipt = input.receipt;
    if (!receipt || receipt.reviewedBy !== "llm_final_response" || receipt.promptSourceId !== "final_response") {
        return { ok: false, reasonCode: "review_receipt_missing" };
    }
    if (input.contentKind === "direct_answer") {
        if (receipt.schemaVersion !== 2) {
            return { ok: false, reasonCode: "review_provenance_missing" };
        }
        const fingerprints = receipt.promptSourceFingerprints;
        if (receipt.promptSourceIds[0] !== "task_intake"
            || receipt.promptSourceIds[1] !== "final_response"
            || !/^[a-f0-9]{64}$/u.test(fingerprints.taskIntakeSha256)
            || !/^[a-f0-9]{64}$/u.test(fingerprints.finalResponseSha256)
            || !receipt.providerInvocationRef.trim()) {
            return { ok: false, reasonCode: "review_provenance_mismatch" };
        }
    }
    if (receipt.rawTextSource !== input.rawTextSource || receipt.contentKind !== input.contentKind) {
        return { ok: false, reasonCode: "review_source_mismatch" };
    }
    if (receipt.rawTextSha256 !== input.rawTextSha256 || receipt.responseTextSha256 !== sha256(input.responseText)) {
        return { ok: false, reasonCode: "review_content_mismatch" };
    }
    if (input.expectedLanguage !== "unknown"
        && receipt.responseLanguage !== "unknown"
        && receipt.responseLanguage !== input.expectedLanguage) {
        return { ok: false, reasonCode: "review_language_mismatch" };
    }
    return { ok: true };
}
export function buildLlmResponseReviewReceipt(input) {
    const rawTextSha256 = sha256(input.rawText);
    const responseTextSha256 = sha256(input.responseText);
    return {
        schemaVersion: 1,
        receiptId: `llm-review:${responseTextSha256.slice(0, 24)}`,
        reviewedBy: "llm_final_response",
        promptSourceId: "final_response",
        contentKind: input.contentKind,
        rawTextSource: input.rawTextSource,
        rawTextSha256,
        responseTextSha256,
        responseLanguage: detectPrimaryMessageLanguage(input.responseText),
    };
}
export function buildDirectLlmResponseReviewReceipt(input) {
    const rawTextSha256 = sha256(input.rawText);
    const responseTextSha256 = sha256(input.responseText);
    const taskIntakeSha256 = input.taskIntakePromptSha256;
    const finalResponseSha256 = input.finalResponsePromptSha256;
    return {
        schemaVersion: 2,
        receiptId: `llm-review-v2:${sha256([
            responseTextSha256,
            taskIntakeSha256,
            finalResponseSha256,
            input.providerInvocationRef,
        ].join(":")).slice(0, 24)}`,
        reviewedBy: "llm_final_response",
        promptSourceId: "final_response",
        promptSourceIds: ["task_intake", "final_response"],
        promptSourceFingerprints: {
            taskIntakeSha256,
            finalResponseSha256,
        },
        providerInvocationRef: input.providerInvocationRef.trim(),
        contentKind: "direct_answer",
        rawTextSource: "llm_generated",
        rawTextSha256,
        responseTextSha256,
        responseLanguage: detectPrimaryMessageLanguage(input.responseText),
    };
}
export function authorizeUserFacingResponse(input) {
    return authorizeFingerprints({
        ...input,
        rawTextSha256: sha256(input.rawText),
    });
}
export function authorizePersistedUserFacingResponse(input) {
    if (!/^[a-f0-9]{64}$/u.test(input.rawTextSha256)) {
        return { ok: false, reasonCode: "review_content_mismatch" };
    }
    return authorizeFingerprints(input);
}
//# sourceMappingURL=user-facing-response-gate.js.map