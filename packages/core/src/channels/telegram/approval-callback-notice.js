export function resolveTelegramApprovalCallbackLanguage(languageCode) {
    const normalized = languageCode?.toLowerCase();
    if (normalized?.startsWith("en"))
        return "en";
    return "ko";
}
export function buildTelegramApprovalCallbackNotice(input) {
    const language = input.language ?? "ko";
    return {
        kind: "telegram_approval_callback_notice",
        language,
        reason: input.reason,
        deliveryMode: "callback_query_answer",
        textSource: "telegram_approval_callback_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
        text: input.text ?? buildTelegramApprovalCallbackText({
            language,
            reason: input.reason,
            approvalKind: input.approvalKind,
            decision: input.decision,
        }),
    };
}
export function buildTelegramApprovalResultLabel(input) {
    const language = input.language ?? "ko";
    if (input.approvalKind === "screen_confirmation") {
        if (input.decision === "allow_run") {
            return language === "en"
                ? `✅ ${input.username} confirmed readiness and continued all steps`
                : `✅ ${input.username}이 준비 완료 후 전체 진행`;
        }
        if (input.decision === "allow_once") {
            return language === "en"
                ? `🔹 ${input.username} confirmed this step`
                : `🔹 ${input.username}이 이번 단계 진행 확인`;
        }
        return language === "en"
            ? `❌ ${input.username} was not ready and cancelled the request`
            : `❌ ${input.username}이 준비 미완료로 요청 취소`;
    }
    if (input.decision === "allow_run") {
        return language === "en"
            ? `✅ ${input.username} approved this whole request`
            : `✅ ${input.username}이 이 요청 전체를 승인함`;
    }
    if (input.decision === "allow_once") {
        return language === "en"
            ? `🔹 ${input.username} approved this step only`
            : `🔹 ${input.username}이 이번 단계만 승인함`;
    }
    return language === "en"
        ? `❌ ${input.username} denied and cancelled the request`
        : `❌ ${input.username}이 거부하고 요청을 취소함`;
}
function buildTelegramApprovalCallbackText(input) {
    if (input.reason === "late") {
        return input.language === "en"
            ? "This approval request has already been handled."
            : "이미 처리된 요청입니다.";
    }
    if (input.reason === "unauthorized") {
        return input.language === "en"
            ? "Not allowed: only the requester can respond."
            : "⚠️ 권한 없음: 요청자만 응답할 수 있습니다.";
    }
    if (input.approvalKind === "screen_confirmation") {
        if (input.decision === "allow_run") {
            return input.language === "en" ? "Ready. Continue all steps." : "✅ 준비 완료 후 전체 진행";
        }
        if (input.decision === "allow_once") {
            return input.language === "en" ? "Continue this step." : "🔹 이번 단계 진행";
        }
        return input.language === "en" ? "Not ready. Cancelled." : "❌ 준비 미완료, 취소";
    }
    if (input.decision === "allow_run") {
        return input.language === "en" ? "Approved for this request." : "✅ 이 요청 전체 승인";
    }
    if (input.decision === "allow_once") {
        return input.language === "en" ? "Approved for this step." : "🔹 이번 단계 승인";
    }
    return input.language === "en" ? "Denied and cancelled." : "❌ 거부 후 취소";
}
//# sourceMappingURL=approval-callback-notice.js.map