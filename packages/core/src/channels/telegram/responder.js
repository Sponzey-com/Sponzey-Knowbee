import { sendTelegramFile, sendTelegramFileWithReceipt, sendTelegramPlainMessage, sendTelegramTextParts, sendTelegramTextPartsWithReceipts, } from "./message-delivery.js";
import { buildToolStatusControl, renderToolStatusControlText } from "../interactive-control.js";
export class TelegramResponder {
    bot;
    chatId;
    threadId;
    language;
    constructor(bot, chatId, threadId, language = "ko") {
        this.bot = bot;
        this.chatId = chatId;
        this.threadId = threadId;
        this.language = language;
    }
    async sendToolStatus(toolName) {
        const text = buildTelegramToolStatusText(toolName, "running", this.language);
        const other = this.threadId !== undefined
            ? { parse_mode: "Markdown", message_thread_id: this.threadId }
            : { parse_mode: "Markdown" };
        const msg = await this.bot.api.sendMessage(this.chatId, text, other);
        return msg.message_id;
    }
    async updateToolStatus(messageId, toolName, success) {
        const text = buildTelegramToolStatusText(toolName, success ? "done" : "failed", this.language);
        try {
            await this.bot.api.editMessageText(this.chatId, messageId, text, {
                parse_mode: "Markdown",
            });
        }
        catch {
            // Message may have been deleted or too old — ignore
        }
    }
    async clearToolStatus(messageId) {
        try {
            await this.bot.api.deleteMessage(this.chatId, messageId);
        }
        catch {
            // Message may have been deleted or too old — ignore
        }
    }
    async sendFinalResponse(text) {
        return sendTelegramTextParts({
            api: this.bot.api,
            target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
            text,
        });
    }
    async sendFinalResponseWithReceipts(text, idempotencyKeyPrefix) {
        return sendTelegramTextPartsWithReceipts({
            api: this.bot.api,
            target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
            text,
            idempotencyKeyPrefix,
        });
    }
    async sendError(message) {
        return sendTelegramPlainMessage({
            api: this.bot.api,
            target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
            text: message,
        });
    }
    async sendReceipt(text) {
        return sendTelegramPlainMessage({
            api: this.bot.api,
            target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
            text,
        });
    }
    async sendIntakeAcknowledgement(text) {
        return this.sendReceipt(text);
    }
    async sendFile(filePath, caption) {
        return sendTelegramFile({
            api: this.bot.api,
            target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
            filePath,
            ...(caption !== undefined ? { caption } : {}),
        });
    }
    async sendFileWithReceipt(filePath, idempotencyKey, caption) {
        return sendTelegramFileWithReceipt({
            api: this.bot.api,
            target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
            filePath,
            idempotencyKey,
            ...(caption !== undefined ? { caption } : {}),
        });
    }
}
function buildTelegramToolStatusText(toolName, status, language) {
    return renderToolStatusControlText(buildToolStatusControl({
        toolLabel: toolName,
        status: status === "done" ? "succeeded" : status,
        language,
    }), "telegram");
}
//# sourceMappingURL=responder.js.map