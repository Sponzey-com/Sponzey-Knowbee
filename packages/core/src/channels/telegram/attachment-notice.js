export function resolveTelegramAttachmentNoticeLanguage(languageCode) {
    const normalized = languageCode?.toLowerCase();
    if (normalized?.startsWith("en"))
        return "en";
    return "ko";
}
export function buildTelegramAttachmentDownloadFailureNotice(input) {
    const language = input.language ?? "ko";
    const reason = input.reason.trim() || "unknown error";
    const label = input.attachmentKind === "photo"
        ? language === "en" ? "Photo" : "사진"
        : language === "en" ? "File" : "파일";
    const action = language === "en" ? "download failed" : "다운로드 실패";
    return {
        kind: "telegram_attachment_download_failed",
        attachmentKind: input.attachmentKind,
        language,
        text: `${label} ${action}: ${reason}`,
        deliveryMode: "receipt",
        textSource: "telegram_attachment_control_notice",
        renderingRequired: "llm_final_response",
        finalAnswer: false,
        assistantIdentityClaim: false,
    };
}
//# sourceMappingURL=attachment-notice.js.map