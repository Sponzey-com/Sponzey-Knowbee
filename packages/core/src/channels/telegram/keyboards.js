import { InlineKeyboard } from "grammy";
export function resolveTelegramApprovalRequestLanguage(languageCode) {
    return languageCode?.toLowerCase().startsWith("en") ? "en" : "ko";
}
export function buildApprovalKeyboard(runId, language = "ko") {
    const copy = telegramApprovalKeyboardCopy(language);
    return new InlineKeyboard()
        .text(copy.approveAll, `approve:${runId}:all`)
        .row()
        .text(copy.approveOnce, `approve:${runId}:once`)
        .row()
        .text(copy.deny, `deny:${runId}`);
}
export function buildResultKeyboard(label) {
    return new InlineKeyboard().text(label, "noop");
}
function telegramApprovalKeyboardCopy(language) {
    if (language === "en") {
        return {
            approveAll: "✅ Approve all",
            approveOnce: "🔹 This step only",
            deny: "❌ Deny and cancel",
        };
    }
    return {
        approveAll: "✅ 전체 승인",
        approveOnce: "🔹 이번 단계만",
        deny: "❌ 거부 후 취소",
    };
}
//# sourceMappingURL=keyboards.js.map