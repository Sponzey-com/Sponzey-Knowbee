import type { Bot } from "grammy"
import {
  sendTelegramFile,
  sendTelegramFileWithReceipt,
  sendTelegramPlainMessage,
  sendTelegramTextParts,
  sendTelegramTextPartsWithReceipts,
  type TelegramFileDeliveryResult,
  type TelegramTextPartsDeliveryResult,
} from "./message-delivery.js"
import { buildToolStatusControl, renderToolStatusControlText } from "../interactive-control.js"
import type { IntakeAcknowledgementControlText } from "../intake-acknowledgement-control.js"

export type TelegramResponderLanguage = "ko" | "en"

export class TelegramResponder {
  constructor(
    private bot: Bot,
    private chatId: number,
    private threadId?: number | undefined,
    private language: TelegramResponderLanguage = "ko",
  ) {}

  async sendToolStatus(toolName: string): Promise<number> {
    const text = buildTelegramToolStatusText(toolName, "running", this.language)
    const other =
      this.threadId !== undefined
        ? { parse_mode: "Markdown" as const, message_thread_id: this.threadId }
        : { parse_mode: "Markdown" as const }
    const msg = await this.bot.api.sendMessage(this.chatId, text, other)
    return msg.message_id
  }

  async updateToolStatus(messageId: number, toolName: string, success: boolean): Promise<void> {
    const text = buildTelegramToolStatusText(toolName, success ? "done" : "failed", this.language)
    try {
      await this.bot.api.editMessageText(this.chatId, messageId, text, {
        parse_mode: "Markdown",
      })
    } catch {
      // Message may have been deleted or too old — ignore
    }
  }

  async clearToolStatus(messageId: number): Promise<void> {
    try {
      await this.bot.api.deleteMessage(this.chatId, messageId)
    } catch {
      // Message may have been deleted or too old — ignore
    }
  }

  async sendFinalResponse(text: string): Promise<number[]> {
    return sendTelegramTextParts({
      api: this.bot.api,
      target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
      text,
    })
  }

  async sendFinalResponseWithReceipts(
    text: string,
    idempotencyKeyPrefix: string,
  ): Promise<TelegramTextPartsDeliveryResult> {
    return sendTelegramTextPartsWithReceipts({
      api: this.bot.api,
      target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
      text,
      idempotencyKeyPrefix,
    })
  }

  async sendError(message: string): Promise<number> {
    return sendTelegramPlainMessage({
      api: this.bot.api,
      target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
      text: message,
    })
  }

  async sendReceipt(text: string): Promise<number> {
    return sendTelegramPlainMessage({
      api: this.bot.api,
      target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
      text,
    })
  }

  async sendIntakeAcknowledgement(text: IntakeAcknowledgementControlText): Promise<number> {
    return this.sendReceipt(text)
  }

  async sendFile(filePath: string, caption?: string | undefined): Promise<number> {
    return sendTelegramFile({
      api: this.bot.api,
      target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
      filePath,
      ...(caption !== undefined ? { caption } : {}),
    })
  }

  async sendFileWithReceipt(
    filePath: string,
    idempotencyKey: string,
    caption?: string | undefined,
  ): Promise<TelegramFileDeliveryResult> {
    return sendTelegramFileWithReceipt({
      api: this.bot.api,
      target: { chatId: this.chatId, ...(this.threadId !== undefined ? { threadId: this.threadId } : {}) },
      filePath,
      idempotencyKey,
      ...(caption !== undefined ? { caption } : {}),
    })
  }
}

function buildTelegramToolStatusText(
  toolName: string,
  status: "running" | "done" | "failed",
  language: TelegramResponderLanguage,
): string {
  return renderToolStatusControlText(buildToolStatusControl({
    toolLabel: toolName,
    status: status === "done" ? "succeeded" : status,
    language,
  }), "telegram")
}
