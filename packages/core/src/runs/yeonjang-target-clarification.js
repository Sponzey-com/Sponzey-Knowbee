import { detectPrimaryMessageLanguage } from "../channels/language.js";
import { renderUserFacingNoticeText, } from "./user-facing-notice-rendering.js";
const INTERNAL_DETAIL = /(?:instance|computer|operating.?system|session|snapshot|receipt|fingerprint)[_-]?(?:id|ref)?\s*[:=]/iu;
const AUTO_SELECTION = /(?:선택했|선택하겠|사용하겠|selected|chosen|will\s+use)/iu;
export async function renderYeonjangTargetClarification(input) {
    const originalRequest = input.originalRequest.trim();
    if (!originalRequest)
        return { status: "blocked", reason: "yeonjang_target_clarification_request_missing" };
    const candidates = input.decision.candidates.map((candidate) => ({
        label: candidate.label,
        computer_name: candidate.computerName,
        locality: candidate.locality,
        connection_state: candidate.connectionState,
    }));
    const rawText = JSON.stringify({
        instruction: "Ask which Yeonjang instance the user intends. Do not select an instance. Mention only the supplied candidates.",
        language: input.primaryLanguage,
        resolution_status: input.decision.status,
        reason_code: input.decision.reasonCode,
        candidates,
    });
    const render = input.renderNotice ?? ((params) => renderUserFacingNoticeText(params));
    const rendered = await render({
        originalRequest,
        rawText,
        textSource: "runtime_deterministic",
        contentKind: "validation_error",
        reasonPrefix: "yeonjang_target_clarification",
        dependencies: input.dependencies,
    });
    if (rendered.status !== "ready")
        return rendered;
    const text = rendered.text.trim();
    if (text.length > 700)
        return { status: "blocked", reason: "yeonjang_target_clarification_too_long" };
    if (INTERNAL_DETAIL.test(text))
        return { status: "blocked", reason: "yeonjang_target_clarification_internal_detail" };
    if (AUTO_SELECTION.test(text))
        return { status: "blocked", reason: "yeonjang_target_clarification_auto_selected" };
    const language = detectPrimaryMessageLanguage(text);
    if (language !== "unknown" && language !== input.primaryLanguage) {
        return { status: "blocked", reason: "yeonjang_target_clarification_language_mismatch" };
    }
    if (input.decision.status === "ambiguous") {
        const missing = candidates.find((candidate) => !text.includes(candidate.computer_name));
        if (missing)
            return { status: "blocked", reason: "yeonjang_target_clarification_candidate_missing" };
    }
    return { status: "ready", text, textSource: "llm_reviewed" };
}
//# sourceMappingURL=yeonjang-target-clarification.js.map