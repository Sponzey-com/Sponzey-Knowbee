import { InlineKeyboard } from "grammy";
export type TelegramApprovalRequestLanguage = "ko" | "en";
export declare function resolveTelegramApprovalRequestLanguage(languageCode: string | undefined): TelegramApprovalRequestLanguage;
export declare function buildApprovalKeyboard(runId: string, language?: TelegramApprovalRequestLanguage): InlineKeyboard;
export declare function buildResultKeyboard(label: string): InlineKeyboard;
//# sourceMappingURL=keyboards.d.ts.map