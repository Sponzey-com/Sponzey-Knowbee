import type { Bot } from "grammy";
import { type ApprovalAggregateTextLanguage } from "../approval-aggregation.js";
interface ActiveChat {
    chatId: number;
    userId: number;
    threadId?: number | undefined;
    language?: ApprovalAggregateTextLanguage | undefined;
}
export declare const activeChats: Map<string, ActiveChat>;
export declare function setActiveChatForSession(sessionId: string, chatId: number, userId: number, threadId?: number | undefined, language?: ApprovalAggregateTextLanguage | undefined): void;
export declare function clearActiveChatForSession(sessionId: string): void;
export declare function registerApprovalHandler(bot: Bot): void;
export declare function resetTelegramApprovalStateForTest(): void;
export {};
//# sourceMappingURL=approval-handler.d.ts.map