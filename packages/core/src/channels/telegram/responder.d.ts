import type { Bot } from "grammy";
import { type TelegramFileDeliveryResult, type TelegramTextPartsDeliveryResult } from "./message-delivery.js";
import type { IntakeAcknowledgementControlText } from "../intake-acknowledgement-control.js";
export type TelegramResponderLanguage = "ko" | "en";
export declare class TelegramResponder {
    private bot;
    private chatId;
    private threadId?;
    private language;
    constructor(bot: Bot, chatId: number, threadId?: number | undefined, language?: TelegramResponderLanguage);
    sendToolStatus(toolName: string): Promise<number>;
    updateToolStatus(messageId: number, toolName: string, success: boolean): Promise<void>;
    clearToolStatus(messageId: number): Promise<void>;
    sendFinalResponse(text: string): Promise<number[]>;
    sendFinalResponseWithReceipts(text: string, idempotencyKeyPrefix: string): Promise<TelegramTextPartsDeliveryResult>;
    sendError(message: string): Promise<number>;
    sendReceipt(text: string): Promise<number>;
    sendIntakeAcknowledgement(text: IntakeAcknowledgementControlText): Promise<number>;
    sendFile(filePath: string, caption?: string | undefined): Promise<number>;
    sendFileWithReceipt(filePath: string, idempotencyKey: string, caption?: string | undefined): Promise<TelegramFileDeliveryResult>;
}
//# sourceMappingURL=responder.d.ts.map