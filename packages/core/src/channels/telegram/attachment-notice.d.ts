export type TelegramAttachmentKind = "document" | "photo";
export type TelegramAttachmentNoticeLanguage = "ko" | "en";
export interface TelegramAttachmentDownloadFailureNotice {
    kind: "telegram_attachment_download_failed";
    attachmentKind: TelegramAttachmentKind;
    language: TelegramAttachmentNoticeLanguage;
    text: string;
    deliveryMode: "receipt";
    textSource: "telegram_attachment_control_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export declare function resolveTelegramAttachmentNoticeLanguage(languageCode: string | undefined): TelegramAttachmentNoticeLanguage;
export declare function buildTelegramAttachmentDownloadFailureNotice(input: {
    attachmentKind: TelegramAttachmentKind;
    language?: TelegramAttachmentNoticeLanguage | undefined;
    reason: string;
}): TelegramAttachmentDownloadFailureNotice;
//# sourceMappingURL=attachment-notice.d.ts.map