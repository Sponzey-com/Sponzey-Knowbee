import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { renderUserFacingNoticeText, } from "./user-facing-notice-rendering.js";
const SPECULATION = /(?:아마|추측|것\s*같|일\s*수\s*있|maybe|probably|i\s+(?:think|guess)|it\s+(?:may|might))/iu;
const INTERNAL_DETAIL = /(?:diagnosis|evidence|receipt|request|run|session|agent)[_-]?(?:id|ref)?\s*[:=]/iu;
const MAX_FAILURE_REPORT_LENGTH = 700;
function buildRenderingInput(report) {
    return JSON.stringify({
        instruction: "Briefly report only the result, verified reason, and available next actions. Do not expose references or internal metadata.",
        language: report.primaryLanguage,
        result: report.outcome,
        failed_scope: report.failedScope,
        verified_reason: report.verifiedReason.text,
        next_actions: report.nextActions,
        partial_result_available: report.partialResultRefs.length > 0,
    });
}
export async function renderVerifiedFailureReport(input) {
    const originalRequest = input.originalRequest.trim();
    if (!originalRequest)
        return { status: "blocked", reason: "verified_failure_original_request_missing" };
    const rawText = buildRenderingInput(input.report);
    const render = input.renderNotice ?? ((params) => renderUserFacingNoticeText(params));
    const rendered = await render({
        originalRequest,
        rawText,
        textSource: "runtime_deterministic",
        contentKind: "final_report",
        reasonPrefix: "verified_failure_report",
        dependencies: input.dependencies,
    });
    if (rendered.status !== "ready")
        return rendered;
    const text = rendered.text.trim();
    if (text.length > MAX_FAILURE_REPORT_LENGTH)
        return { status: "blocked", reason: "verified_failure_report_too_long" };
    if (SPECULATION.test(text))
        return { status: "blocked", reason: "verified_failure_report_speculation" };
    if (INTERNAL_DETAIL.test(text))
        return { status: "blocked", reason: "verified_failure_report_internal_detail" };
    const language = detectPrimaryMessageLanguage(text);
    if (language !== "unknown" && language !== input.report.primaryLanguage) {
        return { status: "blocked", reason: "verified_failure_report_language_mismatch" };
    }
    return { status: "ready", text, textSource: "llm_reviewed" };
}
//# sourceMappingURL=verified-failure-report-rendering.js.map