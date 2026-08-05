import type { Bot } from "grammy";
import { type AIProvider } from "../../ai/index.js";
import type { KnowbeeConfig } from "../../config/types.js";
import { type FinalResponseIdentityContext, renderFinalResponseText as renderFinalResponseTextDefault } from "../../runs/final-response-renderer.js";
import type { TelegramChannel } from "./bot.js";
export type TelegramCommandName = "start" | "new" | "cancel" | "status" | "help";
export type TelegramCommandResponseLanguage = "ko" | "en";
export interface TelegramCommandStatusSnapshot {
    sessionId: string | undefined;
    runId: string | undefined;
    running: boolean;
}
export interface TelegramCommandResponseInput {
    command: TelegramCommandName;
    language?: TelegramCommandResponseLanguage | undefined;
    userFirstName?: string | undefined;
    sessionKey?: string | undefined;
    status?: TelegramCommandStatusSnapshot | undefined;
    runningCount?: number | undefined;
    aborted?: boolean | undefined;
}
export interface TelegramCommandResponse {
    command: TelegramCommandName;
    language: TelegramCommandResponseLanguage;
    text: string;
    parseMode?: "Markdown" | undefined;
    notice: TelegramCommandResponseNotice;
    textSource: "telegram_command_control_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
export interface TelegramCommandResponseNotice {
    kind: "telegram_command_response_notice";
    command: TelegramCommandName;
    language: TelegramCommandResponseLanguage;
    deliveryMode: "command_response";
    textSource: "telegram_command_control_notice";
    renderingRequired: "llm_final_response";
    finalAnswer: false;
    assistantIdentityClaim: false;
}
interface TelegramReplyContext {
    reply(text: string, options?: {
        parse_mode: "Markdown";
    }): Promise<unknown>;
}
export interface TelegramCommandReplyRenderDependencies {
    renderFinalResponseText?: typeof renderFinalResponseTextDefault;
    getDefaultModel?: () => string;
    getProvider?: () => AIProvider;
    workDir?: string;
    config?: KnowbeeConfig | undefined;
    identityContext?: FinalResponseIdentityContext | undefined;
}
export type TelegramCommandReplyResolution = {
    status: "ready";
    text: string;
    parseMode?: "Markdown" | undefined;
    textSource: "llm_reviewed";
} | {
    status: "blocked";
    reason: string;
};
export declare function resolveTelegramCommandResponseLanguage(languageCode: string | undefined): TelegramCommandResponseLanguage;
export declare function buildTelegramCommandResponseNotice(command: TelegramCommandName, language?: TelegramCommandResponseLanguage): TelegramCommandResponseNotice;
export declare function buildTelegramCommandResponse(input: TelegramCommandResponseInput): TelegramCommandResponse;
export declare function resolveTelegramCommandReply(response: TelegramCommandResponse, dependencies?: TelegramCommandReplyRenderDependencies): Promise<TelegramCommandReplyResolution>;
export declare function replyTelegramCommandResponse(ctx: TelegramReplyContext, response: TelegramCommandResponse, dependencies?: TelegramCommandReplyRenderDependencies): Promise<void>;
export declare function registerCommands(bot: Bot, channel: TelegramChannel, dependencies?: TelegramCommandReplyRenderDependencies): void;
export {};
//# sourceMappingURL=commands.d.ts.map